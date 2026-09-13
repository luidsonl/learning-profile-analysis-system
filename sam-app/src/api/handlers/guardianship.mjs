import { CMD, client, TABLE } from "../lib/db.mjs";
import { ok, errorResponse, parseBody, param, qparam, HttpError, noContent } from "../lib/http.mjs";
import { nowIso } from "../lib/ids.mjs";
import { requireKeys, assert } from "../lib/validate.mjs";
import { requireAuth } from "../lib/session.mjs";
import { auditStudent, assertScopeStudent, getOwnStudentId } from "../lib/scope.mjs";
import { getUser } from "../lib/auth.mjs";
import { getStudent } from "./students.mjs";
import { ageFromRecord, MIN_SELF_CONSENT_AGE } from "../lib/age.mjs";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { selectGuardianHits } from "../lib/accounts.mjs";

const grantGuardian = async (event, ctx) => {
  const studentId = param(event, "id");
  if (!["admin", "educator"].includes(ctx.role)) throw new HttpError(403, "forbidden", "Only educators and admins can assign a responsable");
  if (ctx.role === "educator") await assertScopeStudent(studentId, ctx);
  const body = parseBody(event);
  requireKeys(body, ["userId"]);
  const userId = body.userId;
  const user = await getUser(userId);
  assert(user && user.role === "guardian", "invalid_user", "Target user must be a guardian");

  const at = nowIso();
  await client.send(
    new CMD.transact({
      TransactItems: [
        {
          Put: {
            TableName: TABLE,
            Item: { PK: { S: `USER#${userId}` }, SK: { S: `GUARD#${studentId}` }, type: { S: "edge" }, relation: { S: body.relation || "guardian" }, createdAt: { S: at }, grantedBy: { S: ctx.userId } },
            ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)",
          },
        },
        {
          Put: {
            TableName: TABLE,
            Item: { PK: { S: `STUDENT#${studentId}` }, SK: { S: `GUARDIAN#${userId}` }, type: { S: "edge" }, relation: { S: body.relation || "guardian" }, createdAt: { S: at }, grantedBy: { S: ctx.userId } },
            ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)",
          },
        },
      ],
    }),
  );
  await auditStudent(studentId, ctx, "grant_guardian", `student:${studentId}`, { guardianUserId: userId });

  return ok({ studentId, guardianUserId: userId }, 201);
};

const revokeGuardian = async (event, ctx) => {
  const studentId = param(event, "id");
  const userId = param(event, "userId");
  if (!["admin", "educator"].includes(ctx.role)) throw new HttpError(403, "forbidden", "Only educators and admins can revoke a responsable");
  if (ctx.role === "educator") await assertScopeStudent(studentId, ctx);
  await client.send(
    new CMD.transact({
      TransactItems: [
        { Delete: { TableName: TABLE, Key: { PK: { S: `USER#${userId}` }, SK: { S: `GUARD#${studentId}` } } } },
        { Delete: { TableName: TABLE, Key: { PK: { S: `STUDENT#${studentId}` }, SK: { S: `GUARDIAN#${userId}` } } } },
      ],
    }),
  );
  await auditStudent(studentId, ctx, "revoke_guardian", `student:${studentId}`, { guardianUserId: userId });

  return noContent();
};

const follow = async (event, ctx) => {
  const studentId = param(event, "id");
  assert(ctx.role === "educator", "forbidden", "Only educators can follow students", 403);
  if (!(await getStudent(studentId))) throw new HttpError(404, "student_not_found", "Student not found");
  const at = nowIso();
  await client.send(
    new CMD.transact({
      TransactItems: [
        {
          Put: { TableName: TABLE, Item: { PK: { S: `USER#${ctx.userId}` }, SK: { S: `FOLLOW#${studentId}` }, type: { S: "edge" }, createdAt: { S: at } }, ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)" },
        },
        {
          Put: { TableName: TABLE, Item: { PK: { S: `STUDENT#${studentId}` }, SK: { S: `EDUCATOR#${ctx.userId}` }, type: { S: "edge" }, createdAt: { S: at } }, ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)" },
        },
      ],
    }),
  );
  await auditStudent(studentId, ctx, "follow", `student:${studentId}`);
  return ok({ studentId }, 201);
};

const unfollow = async (event, ctx) => {
  const studentId = param(event, "id");
  assert(ctx.role === "educator", "forbidden", "Only educators can unfollow students", 403);
  await client.send(
    new CMD.transact({
      TransactItems: [
        { Delete: { TableName: TABLE, Key: { PK: { S: `USER#${ctx.userId}` }, SK: { S: `FOLLOW#${studentId}` } } } },
        { Delete: { TableName: TABLE, Key: { PK: { S: `STUDENT#${studentId}` }, SK: { S: `EDUCATOR#${ctx.userId}` } } } },
      ],
    }),
  );
  await auditStudent(studentId, ctx, "unfollow", `student:${studentId}`);
  return noContent();
};

const linkStudentAccount = async (event, ctx) => {
  const studentId = param(event, "id");
  const accountUserId = param(event, "userId");
  if (!["admin", "educator"].includes(ctx.role)) {
    throw new HttpError(403, "forbidden", "Only an educator following the student or an admin can link a student account");
  }
  if (ctx.role === "educator") await assertScopeStudent(studentId, ctx);

  const student = await getStudent(studentId);
  if (!student) throw new HttpError(404, "student_not_found", "Student not found");

  const account = await getUser(accountUserId);
  if (!account || account.role !== "student") throw new HttpError(404, "student_account_not_found", "Student account not found");

  // At most one in both directions: the entity holds a single `studentUserId`
  // and the account links to a single entity (specs/dynamodb-schema.md).
  if (student.studentUserId) throw new HttpError(409, "student_account_exists", "A student account is already linked to this student");
  if (await getOwnStudentId(accountUserId)) throw new HttpError(409, "account_already_linked", "This student account is already linked to a student");

  // Consent gates the link: an adult (>= MIN_SELF_CONSENT_AGE) self-consents;
  // a minor (< 18) requires guardian/institution consent already granted on the
  // entity (specs/auth.md + lgpd.md). Adult vs minor is decided from the
  // STUDENT entity's birth date (age authority = the ficha) — the account holds
  // no age and never gates consent.
  const adult = ageFromRecord(student) >= MIN_SELF_CONSENT_AGE;
  if (!adult && student.consentStatus !== "active") {
    throw new HttpError(409, "consent_required", "Active consent is required before linking a minor student's account");
  }

  const at = nowIso();
  await client.send(
    new CMD.transact({
      TransactItems: [
        {
          Put: { TableName: TABLE, Item: { PK: { S: `USER#${accountUserId}` }, SK: { S: `STUDENT#${studentId}` }, type: { S: "edge" }, createdAt: { S: at } }, ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)" },
        },
        {
          Put: { TableName: TABLE, Item: { PK: { S: `STUDENT#${studentId}` }, SK: { S: `LOGIN#${accountUserId}` }, type: { S: "edge" }, createdAt: { S: at } }, ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)" },
        },
        {
          Update: {
            TableName: TABLE,
            Key: { PK: { S: `STUDENT#${studentId}` }, SK: { S: "META" } },
            UpdateExpression: "SET #studentUserId = :sid, #updatedAt = :at",
            ExpressionAttributeNames: { "#studentUserId": "studentUserId", "#updatedAt": "updatedAt" },
            ExpressionAttributeValues: { ":sid": { S: accountUserId }, ":at": { S: at } },
            ConditionExpression: "attribute_not_exists(#studentUserId)",
          },
        },
        {
          Update: {
            TableName: TABLE,
            Key: { PK: { S: `USER#${accountUserId}` }, SK: { S: "META" } },
            UpdateExpression: "SET #status = :st, GSI2PK = :gpk, GSI2SK = :gsk, #updatedAt = :at",
            ExpressionAttributeNames: { "#status": "status", "#updatedAt": "updatedAt" },
            ExpressionAttributeValues: {
              ":st": { S: "active" },
              ":gpk": { S: "USER#ROLE#student" },
              ":gsk": { S: `USER#${accountUserId}#active` },
              ":at": { S: at },
            },
          },
        },
      ],
    }),
  ).catch((e) => {
    if (e.name === "TransactionCanceledException") throw new HttpError(409, "conflict", "Could not link the student account");
    throw e;
  });

  await auditStudent(studentId, ctx, "link_student_account", `student:${studentId}`, { studentUserId: accountUserId, role: "student" });

  return ok({ studentId, userId: accountUserId }, 200);
};

const listGuardians = async (event, ctx) => {
  const studentId = param(event, "id");
  await assertScopeStudent(studentId, ctx);
  const res = await client.send(
    new CMD.query({ TableName: TABLE, KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)", ExpressionAttributeValues: { ":pk": { S: `STUDENT#${studentId}` }, ":sk": { S: "GUARDIAN#" } } }),
  );
  const data = [];
  for (const edge of res.Items || []) {
    const userId = edge.SK.S.replace("GUARDIAN#", "");
    const u = await getUser(userId);
    if (u) data.push({ userId, name: u.name, email: u.email, relation: edge.relation?.S, grantedAt: edge.createdAt?.S });
  }
  return ok({ data });
};

const listEducators = async (event, ctx) => {
  const studentId = param(event, "id");
  await assertScopeStudent(studentId, ctx);
  const res = await client.send(
    new CMD.query({ TableName: TABLE, KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)", ExpressionAttributeValues: { ":pk": { S: `STUDENT#${studentId}` }, ":sk": { S: "EDUCATOR#" } } }),
  );
  const data = [];
  for (const edge of res.Items || []) {
    const userId = edge.SK.S.replace("EDUCATOR#", "");
    const u = await getUser(userId);
    if (u) data.push({ userId, name: u.name, email: u.email, followedAt: edge.createdAt?.S });
  }
  return ok({ data });
};

const searchGuardians = async (event, ctx) => {
  if (!["educator", "admin"].includes(ctx.role)) {
    throw new HttpError(403, "forbidden", "Only educators and admins can list guardian accounts");
  }
  const email = (qparam(event, "email") || "").trim().toLowerCase();
  // GSI2 groups every guardian; the email prefix narrows the in-memory match.
  // Omitting `email` lists every active guardian account (name/email filter is
  // then done client-side). Only active guardians can receive guardianship —
  // pending/denied accounts are excluded.
  const res = await client.send(
    new CMD.query({
      TableName: TABLE,
      IndexName: "RoleStatus",
      KeyConditionExpression: "GSI2PK = :pk",
      ExpressionAttributeValues: { ":pk": { S: "USER#ROLE#guardian" } },
    }),
  );
  const data = selectGuardianHits(
    (res.Items || []).map((item) => unmarshall(item)),
    email,
  );
  return ok({ data, count: data.length });
};

export const lambdaHandler = async (event) => {
  try {
    const route = `${event.httpMethod} ${event.resource}`;
    const ctx = await requireAuth(event);
    switch (route) {
      case "POST /students/{id}/guardians":
        return await grantGuardian(event, ctx);
      case "DELETE /students/{id}/guardians/{userId}":
        return await revokeGuardian(event, ctx);
      case "POST /students/{id}/follow":
        return await follow(event, ctx);
      case "DELETE /students/{id}/follow":
        return await unfollow(event, ctx);
      case "POST /students/{id}/accounts/{userId}/link":
        return await linkStudentAccount(event, ctx);
      case "GET /students/{id}/guardians":
        return await listGuardians(event, ctx);
      case "GET /students/{id}/educators":
        return await listEducators(event, ctx);
      case "GET /users":
        return await searchGuardians(event, ctx);
      default:
        throw new HttpError(404, "not_found", "Route not found");
    }
  } catch (err) {
    return errorResponse(err);
  }
};
