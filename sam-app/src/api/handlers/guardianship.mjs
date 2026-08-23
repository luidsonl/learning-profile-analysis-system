import { CMD, client, TABLE } from "../lib/db.mjs";
import { ok, errorResponse, parseBody, param, HttpError, noContent } from "../lib/http.mjs";
import { nowIso } from "../lib/ids.mjs";
import { requireKeys, isEmail, assert } from "../lib/validate.mjs";
import { requireAuth } from "../lib/session.mjs";
import { auditStudent, assertScopeStudent } from "../lib/scope.mjs";
import { hashPassword, getUserByEmail, getUser } from "../lib/auth.mjs";
import { getStudent } from "./students.mjs";
import { uid } from "../lib/ids.mjs";

const isPrimaryGuardian = async (studentId, ctx) => {
  if (ctx.role === "admin") return true;
  if (ctx.role !== "guardian") return false;
  const student = await getStudent(studentId);
  return student?.createdBy === ctx.userId;
};

const grantGuardian = async (event, ctx) => {
  const studentId = param(event, "id");
  if (!(await isPrimaryGuardian(studentId, ctx))) throw new HttpError(403, "forbidden", "Only the primary guardian or an admin can grant guardianship");
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
  assert(ctx.role === "admin", "forbidden", "Only admins can revoke guardianship", 403);
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

const canCreateStudentAccount = async (studentId, ctx) => {
  if (ctx.role === "admin") return true;
  if (ctx.role === "educator") {
    await assertScopeStudent(studentId, ctx);
    return true;
  }
  if (ctx.role === "guardian") return (await getStudent(studentId))?.createdBy === ctx.userId;
  return false;
};

const createStudentAccount = async (event, ctx) => {
  const studentId = param(event, "id");
  if (!(await canCreateStudentAccount(studentId, ctx))) throw new HttpError(403, "forbidden", "Only the primary guardian, an educator following the student or an admin can create the student account");

  const student = await getStudent(studentId);
  if (!student) throw new HttpError(404, "student_not_found", "Student not found");
  assert(student.consentStatus === "active", "consent_required", "Active consent is required before creating the student account", 409);
  assert(!student.studentUserId, "student_account_exists", "A student account already exists for this student", 409);

  const body = parseBody(event);
  requireKeys(body, ["email", "name", "password"]);
  assert(isEmail(body.email), "invalid_email", "Email is not valid");
  assert(String(body.password).length >= 8, "weak_password", "Password must have at least 8 characters");

  const email = body.email.trim().toLowerCase();
  if (await getUserByEmail(email)) throw new HttpError(409, "email_in_use", "Email already registered");

  const studentUserId = uid();
  const at = nowIso();
  const passwordHash = await hashPassword(body.password);

  await client.send(
    new CMD.transact({
      TransactItems: [
        {
          Put: {
            TableName: TABLE,
            Item: {
              PK: { S: `USER#${studentUserId}` },
              SK: { S: "META" },
              type: { S: "user" },
              userId: { S: studentUserId },
              name: { S: body.name },
              email: { S: email },
              role: { S: "student" },
              passwordHash: { S: passwordHash },
              status: { S: "active" },
              createdAt: { S: at },
              createdBy: { S: ctx.userId },
              GSI2PK: { S: "USER#ROLE#student" },
              GSI2SK: { S: `USER#${studentUserId}#active` },
            },
            ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)",
          },
        },
        {
          Put: {
            TableName: TABLE,
            Item: { PK: { S: `EMAIL#${email}` }, SK: { S: `EMAIL#${email}` }, type: { S: "email-reservation" }, userId: { S: studentUserId }, GSI1PK: { S: `EMAIL#${email}` }, GSI1SK: { S: `USER#${studentUserId}` } },
            ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)",
          },
        },
        {
          Put: { TableName: TABLE, Item: { PK: { S: `STUDENT#${studentId}` }, SK: { S: `LOGIN#${studentUserId}` }, type: { S: "edge" }, createdAt: { S: at } }, ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)" },
        },
        {
          Put: { TableName: TABLE, Item: { PK: { S: `USER#${studentUserId}` }, SK: { S: `STUDENT#${studentId}` }, type: { S: "edge" }, createdAt: { S: at } }, ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)" },
        },
        {
          Update: {
            TableName: TABLE,
            Key: { PK: { S: `STUDENT#${studentId}` }, SK: { S: "META" } },
            UpdateExpression: "SET #studentUserId = :sid, #updatedAt = :at",
            ExpressionAttributeNames: { "#studentUserId": "studentUserId", "#updatedAt": "updatedAt" },
            ExpressionAttributeValues: { ":sid": { S: studentUserId }, ":at": { S: at } },
          },
        },
      ],
    }),
  ).catch((e) => {
    if (e.name === "TransactionCanceledException") throw new HttpError(409, "conflict", "Could not create student account");
    throw e;
  });

  await auditStudent(studentId, ctx, "create_student_account", `student:${studentId}`, { studentUserId });

  return ok({ userId: studentUserId }, 201);
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
      case "POST /students/{id}/student-account":
        return await createStudentAccount(event, ctx);
      case "GET /students/{id}/guardians":
        return await listGuardians(event, ctx);
      case "GET /students/{id}/educators":
        return await listEducators(event, ctx);
      default:
        throw new HttpError(404, "not_found", "Route not found");
    }
  } catch (err) {
    return errorResponse(err);
  }
};
