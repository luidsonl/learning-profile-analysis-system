import { CMD, client, TABLE } from "../lib/db.mjs";
import { ok, errorResponse, parseBody, param, HttpError, noContent } from "../lib/http.mjs";
import { nowIso } from "../lib/ids.mjs";
import { requireKeys, isEmail, assert } from "../lib/validate.mjs";
import { requireAuth } from "../lib/session.mjs";
import { auditChild, assertScopeChild } from "../lib/scope.mjs";
import { hashPassword, getUserByEmail, getUser } from "../lib/auth.mjs";
import { getChild } from "./children.mjs";
import { uid } from "../lib/ids.mjs";

const isPrimaryGuardian = async (childId, ctx) => {
  if (ctx.role === "admin") return true;
  if (ctx.role !== "guardian") return false;
  const child = await getChild(childId);
  return child?.createdBy === ctx.userId;
};

const grantGuardian = async (event, ctx) => {
  const childId = param(event, "id");
  if (!(await isPrimaryGuardian(childId, ctx))) throw new HttpError(403, "forbidden", "Only the primary guardian or an admin can grant guardianship");
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
            Item: { PK: { S: `USER#${userId}` }, SK: { S: `GUARD#${childId}` }, type: { S: "edge" }, relation: { S: body.relation || "guardian" }, createdAt: { S: at }, grantedBy: { S: ctx.userId } },
            ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)",
          },
        },
        {
          Put: {
            TableName: TABLE,
            Item: { PK: { S: `CHILD#${childId}` }, SK: { S: `GUARDIAN#${userId}` }, type: { S: "edge" }, relation: { S: body.relation || "guardian" }, createdAt: { S: at }, grantedBy: { S: ctx.userId } },
            ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)",
          },
        },
      ],
    }),
  );
  await auditChild(childId, ctx, "grant_guardian", `child:${childId}`, { guardianUserId: userId });

  return ok({ childId, guardianUserId: userId }, 201);
};

const revokeGuardian = async (event, ctx) => {
  const childId = param(event, "id");
  const userId = param(event, "userId");
  assert(ctx.role === "admin", "forbidden", "Only admins can revoke guardianship", 403);
  await client.send(
    new CMD.transact({
      TransactItems: [
        { Delete: { TableName: TABLE, Key: { PK: { S: `USER#${userId}` }, SK: { S: `GUARD#${childId}` } } } },
        { Delete: { TableName: TABLE, Key: { PK: { S: `CHILD#${childId}` }, SK: { S: `GUARDIAN#${userId}` } } } },
      ],
    }),
  );
  await auditChild(childId, ctx, "revoke_guardian", `child:${childId}`, { guardianUserId: userId });

  return noContent();
};

const follow = async (event, ctx) => {
  const childId = param(event, "id");
  assert(ctx.role === "educator", "forbidden", "Only educators can follow children", 403);
  if (!(await getChild(childId))) throw new HttpError(404, "child_not_found", "Child not found");
  const at = nowIso();
  await client.send(
    new CMD.transact({
      TransactItems: [
        {
          Put: { TableName: TABLE, Item: { PK: { S: `USER#${ctx.userId}` }, SK: { S: `FOLLOW#${childId}` }, type: { S: "edge" }, createdAt: { S: at } }, ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)" },
        },
        {
          Put: { TableName: TABLE, Item: { PK: { S: `CHILD#${childId}` }, SK: { S: `EDUCATOR#${ctx.userId}` }, type: { S: "edge" }, createdAt: { S: at } }, ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)" },
        },
      ],
    }),
  );
  await auditChild(childId, ctx, "follow", `child:${childId}`);
  return ok({ childId }, 201);
};

const unfollow = async (event, ctx) => {
  const childId = param(event, "id");
  assert(ctx.role === "educator", "forbidden", "Only educators can unfollow children", 403);
  await client.send(
    new CMD.transact({
      TransactItems: [
        { Delete: { TableName: TABLE, Key: { PK: { S: `USER#${ctx.userId}` }, SK: { S: `FOLLOW#${childId}` } } } },
        { Delete: { TableName: TABLE, Key: { PK: { S: `CHILD#${childId}` }, SK: { S: `EDUCATOR#${ctx.userId}` } } } },
      ],
    }),
  );
  await auditChild(childId, ctx, "unfollow", `child:${childId}`);
  return noContent();
};

const createStudentAccount = async (event, ctx) => {
  const childId = param(event, "id");
  if (!(await isPrimaryGuardian(childId, ctx))) throw new HttpError(403, "forbidden", "Only the primary guardian or an admin can create the student account");

  const child = await getChild(childId);
  if (!child) throw new HttpError(404, "child_not_found", "Child not found");
  assert(child.consentStatus === "active", "consent_required", "Active consent is required before creating the student account", 409);
  assert(!child.studentUserId, "student_account_exists", "A student account already exists for this child", 409);

  const body = parseBody(event);
  requireKeys(body, ["email", "name", "password"]);
  assert(isEmail(body.email), "invalid_email", "Email is not valid");
  assert(String(body.password).length >= 8, "weak_password", "Password must have at least 8 characters");

  const email = body.email.trim().toLowerCase();
  if (await getUserByEmail(email)) throw new HttpError(409, "email_in_use", "Email already registered");

  const studentId = uid();
  const at = nowIso();
  const passwordHash = await hashPassword(body.password);

  await client.send(
    new CMD.transact({
      TransactItems: [
        {
          Put: {
            TableName: TABLE,
            Item: {
              PK: { S: `USER#${studentId}` },
              SK: { S: "META" },
              type: { S: "user" },
              userId: { S: studentId },
              name: { S: body.name },
              email: { S: email },
              role: { S: "student" },
              passwordHash: { S: passwordHash },
              status: { S: "active" },
              createdAt: { S: at },
              createdBy: { S: ctx.userId },
              GSI2PK: { S: "USER#ROLE#student" },
              GSI2SK: { S: `USER#${studentId}#active` },
            },
            ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)",
          },
        },
        {
          Put: {
            TableName: TABLE,
            Item: { PK: { S: `EMAIL#${email}` }, SK: { S: `EMAIL#${email}` }, type: { S: "email-reservation" }, userId: { S: studentId }, GSI1PK: { S: `EMAIL#${email}` }, GSI1SK: { S: `USER#${studentId}` } },
            ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)",
          },
        },
        {
          Put: { TableName: TABLE, Item: { PK: { S: `CHILD#${childId}` }, SK: { S: `STUDENT#${studentId}` }, type: { S: "edge" }, createdAt: { S: at } }, ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)" },
        },
        {
          Put: { TableName: TABLE, Item: { PK: { S: `USER#${studentId}` }, SK: { S: `CHILD#${childId}` }, type: { S: "edge" }, createdAt: { S: at } }, ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)" },
        },
        {
          Update: {
            TableName: TABLE,
            Key: { PK: { S: `CHILD#${childId}` }, SK: { S: "META" } },
            UpdateExpression: "SET #studentUserId = :sid, #updatedAt = :at",
            ExpressionAttributeNames: { "#studentUserId": "studentUserId", "#updatedAt": "updatedAt" },
            ExpressionAttributeValues: { ":sid": { S: studentId }, ":at": { S: at } },
          },
        },
      ],
    }),
  ).catch((e) => {
    if (e.name === "TransactionCanceledException") throw new HttpError(409, "conflict", "Could not create student account");
    throw e;
  });

  await auditChild(childId, ctx, "create_student_account", `child:${childId}`, { studentUserId: studentId });

  return ok({ userId: studentId }, 201);
};

const listGuardians = async (event, ctx) => {
  const childId = param(event, "id");
  await assertScopeChild(childId, ctx);
  const res = await client.send(
    new CMD.query({ TableName: TABLE, KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)", ExpressionAttributeValues: { ":pk": { S: `CHILD#${childId}` }, ":sk": { S: "GUARDIAN#" } } }),
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
  const childId = param(event, "id");
  await assertScopeChild(childId, ctx);
  const res = await client.send(
    new CMD.query({ TableName: TABLE, KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)", ExpressionAttributeValues: { ":pk": { S: `CHILD#${childId}` }, ":sk": { S: "EDUCATOR#" } } }),
  );
  const data = [];
  for (const edge of res.Items || []) {
    const userId = edge.SK.S.replace("EDUCATOR#", "");
    const u = await getUser(userId);
    if (u) data.push({ userId, name: u.name, email: u.email, followedAt: edge.createdAt?.S });
  }
  return ok({ data });
};

export const lambdaHandler = async (event) => {
  try {
    const route = `${event.httpMethod} ${event.resource}`;
    const ctx = await requireAuth(event);
    switch (route) {
      case "POST /children/{id}/guardians":
        return await grantGuardian(event, ctx);
      case "DELETE /children/{id}/guardians/{userId}":
        return await revokeGuardian(event, ctx);
      case "POST /children/{id}/follow":
        return await follow(event, ctx);
      case "DELETE /children/{id}/follow":
        return await unfollow(event, ctx);
      case "POST /children/{id}/student-account":
        return await createStudentAccount(event, ctx);
      case "GET /children/{id}/guardians":
        return await listGuardians(event, ctx);
      case "GET /children/{id}/educators":
        return await listEducators(event, ctx);
      default:
        throw new HttpError(404, "not_found", "Route not found");
    }
  } catch (err) {
    return errorResponse(err);
  }
};
