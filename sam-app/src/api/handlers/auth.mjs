import { CMD, client, TABLE } from "../lib/db.mjs";
import { ok, errorResponse, parseBody, HttpError } from "../lib/http.mjs";
import { uid, nowIso, ttlSeconds } from "../lib/ids.mjs";
import { requireKeys, isEmail, assert } from "../lib/validate.mjs";
import { hashPassword, verifyPassword, genToken, getUserByEmail, getUser } from "../lib/auth.mjs";
import { requireAuth } from "../lib/session.mjs";
import { writeAudit, getOwnStudentId } from "../lib/scope.mjs";

const ROLES = ["guardian", "educator", "admin"];

const publicUser = (u) => ({
  userId: u.userId,
  name: u.name,
  email: u.email,
  role: u.role,
  createdAt: u.createdAt,
});

const register = async (event) => {
  const body = parseBody(event);
  requireKeys(body, ["email", "name", "password"]);
  assert(isEmail(body.email), "invalid_email", "Email is not valid");
  assert(String(body.password).length >= 8, "weak_password", "Password must have at least 8 characters");
  const role = body.role || "guardian";
  assert(ROLES.includes(role), "invalid_role", `Role must be one of ${ROLES.join(", ")}`);
  assert(role !== "admin", "invalid_role", "Admin accounts are provisioned by an operator");
  if (body.role === "student") throw new HttpError(400, "invalid_role", "Student accounts are created by a guardian");

  const email = body.email.trim().toLowerCase();
  const existing = await getUserByEmail(email);
  if (existing) throw new HttpError(409, "email_in_use", "Email already registered");

  const userId = uid();
  const at = nowIso();
  const passwordHash = await hashPassword(body.password);

  await client.send(
    new CMD.transact({
      TransactItems: [
        {
          Put: {
            TableName: TABLE,
            Item: {
              PK: { S: `USER#${userId}` },
              SK: { S: "META" },
              type: { S: "user" },
              userId: { S: userId },
              name: { S: body.name },
              email: { S: email },
              role: { S: role },
              passwordHash: { S: passwordHash },
              status: { S: "active" },
              createdAt: { S: at },
              GSI2PK: { S: `USER#ROLE#${role}` },
              GSI2SK: { S: `USER#${userId}#active` },
            },
            ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)",
          },
        },
        {
          Put: {
            TableName: TABLE,
            Item: {
              PK: { S: `EMAIL#${email}` },
              SK: { S: `EMAIL#${email}` },
              type: { S: "email-reservation" },
              userId: { S: userId },
              GSI1PK: { S: `EMAIL#${email}` },
              GSI1SK: { S: `USER#${userId}` },
            },
            ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)",
          },
        },
      ],
    }),
  ).catch((e) => {
    if (e.name === "TransactionCanceledException") throw new HttpError(409, "email_in_use", "Email already registered");
    throw e;
  });

  await writeAudit({
    subjectType: "USER",
    subjectId: userId,
    actorId: userId,
    actorRole: role,
    action: "register",
    resource: "auth",
    ip: event.requestContext?.identity?.sourceIp,
  });

  return ok({ user: { userId, name: body.name, email, role, createdAt: at } }, 201);
};

const login = async (event) => {
  const body = parseBody(event);
  requireKeys(body, ["email", "password"]);

  const user = await getUserByEmail(body.email);
  if (!user || user.status !== "active") throw new HttpError(401, "invalid_credentials", "Invalid email or password");
  const valid = await verifyPassword(body.password, user.passwordHash);
  if (!valid) throw new HttpError(401, "invalid_credentials", "Invalid email or password");

  const token = genToken();
  const sessionId = uid();
  const at = nowIso();
  await client.send(
    new CMD.put({
      TableName: TABLE,
      Item: {
        PK: { S: `SESSION#${sessionId}` },
        SK: { S: `TOKEN#${token}` },
        type: { S: "session" },
        token: { S: token },
        userId: { S: user.userId },
        role: { S: user.role },
        createdAt: { S: at },
        ttl: { N: String(ttlSeconds(7 * 24 * 3600)) },
        GSI1PK: { S: `SESSION#${token}` },
        GSI1SK: { S: `USER#${user.userId}` },
      },
    }),
  );

  return ok({ token, user: publicUser(user) });
};

const logout = async (event, ctx) => {
  const token = ctx.session?.token?.S;
  const sessionId = ctx.session?.PK?.S.replace("SESSION#", "");
  if (sessionId) {
    await client.send(
      new CMD.delete({ TableName: TABLE, Key: { PK: { S: `SESSION#${sessionId}` }, SK: { S: `TOKEN#${token}` } } }),
    );
  }
  return ok({ message: "logged_out" });
};

const me = async (event, ctx) => {
  const user = await getUser(ctx.userId);
  if (!user) throw new HttpError(404, "user_not_found", "User not found");
  const payload = { user: publicUser(user) };
  // Student self-view needs the student id that this account owns.
  if (user.role === "student") {
    payload.studentId = await getOwnStudentId(user.userId);
  }
  return ok(payload);
};

export const lambdaHandler = async (event) => {
  try {
    const route = `${event.httpMethod} ${event.resource}`;
    let ctx = null;
    if (route !== "POST /auth/register" && route !== "POST /auth/login") {
      ctx = await requireAuth(event);
    }
    switch (route) {
      case "POST /auth/register":
        return await register(event);
      case "POST /auth/login":
        return await login(event);
      case "POST /auth/logout":
        return await logout(event, ctx);
      case "GET /auth/me":
        return await me(event, ctx);
      default:
        throw new HttpError(404, "not_found", "Route not found");
    }
  } catch (err) {
    return errorResponse(err);
  }
};
