import { CMD, client, TABLE } from "../lib/db.mjs";
import { HttpError, errorResponse, ok } from "../lib/http.mjs";
import { requireAuth } from "../lib/session.mjs";
import { hashPassword } from "../lib/auth.mjs";
import { writeAudit } from "../lib/scope.mjs";
import { computeAge, MIN_SELF_CONSENT_AGE } from "../lib/age.mjs";

const ROLES = ["guardian", "educator", "admin", "student"];
const STATUSES = ["pending", "active", "denied"];

const parseId = (path, key) => {
  const id = path[key];
  if (!id) throw new HttpError(400, "missing_param", `${key} is required`);
  return id;
};

const getUser = async (userId) => {
  const res = await client.send(
    new CMD.get({ TableName: TABLE, Key: { PK: { S: `USER#${userId}` }, SK: { S: "META" } } }),
  );
  return res.Item ? { userId, ...unmarshallItem(res.Item) } : null;
};

const unmarshallItem = (item) => {
  return Object.fromEntries(
    Object.entries(item).map(([k, v]) => {
      const t = v.S !== undefined ? "S" : v.N !== undefined ? "N" : "B";
      return [k, v[t]];
    }),
  );
};

const listUsers = async (event, ctx) => {
  const q = event.queryStringParameters || {};
  // Educators manage (approve) responsable and student accounts only.
  const visibleRoles = ctx.role === "educator" ? ["guardian", "student"] : ROLES;
  const role = q.role && visibleRoles.includes(q.role) ? q.role : null;
  const status = q.status && STATUSES.includes(q.status) ? q.status : null;

  const targets = role ? [role] : visibleRoles;
  const seen = new Set();
  const users = [];
  for (const r of targets) {
    const res = await client.send(
      new CMD.query({
        TableName: TABLE,
        IndexName: "RoleStatus",
        KeyConditionExpression: "GSI2PK = :pk",
        ExpressionAttributeValues: { ":pk": { S: `USER#ROLE#${r}` } },
      }),
    );
    for (const item of res.Items || []) {
      const u = unmarshallItem(item);
      if (u.status === undefined || u.userId === undefined) continue;
      if (seen.has(u.userId)) continue;
      seen.add(u.userId);
      if (status && u.status !== status) continue;
      users.push(publicUser(u));
    }
  }
  users.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
  return ok({ data: users, count: users.length });
};

const publicUser = (u) => {
  const out = {
    userId: u.userId,
    name: u.name,
    email: u.email,
    role: u.role,
    status: u.status,
    createdAt: u.createdAt,
  };
  if (u.birthDate !== undefined) out.birthDate = u.birthDate;
  if (u.age !== undefined) out.age = u.age;
  if (u.consentEligible !== undefined) out.consentEligible = u.consentEligible;
  return out;
};

const applyChanges = async (userId, actorId, actorRole, ip, { role, status, birthDate }) => {
  const user = await getUser(userId);
  if (!user) throw new HttpError(404, "user_not_found", "User not found");

  const newRole = role ?? user.role;
  const newStatus = status ?? user.status;
  const newBirthDate = birthDate ?? user.birthDate;
  if (!ROLES.includes(newRole)) throw new HttpError(400, "invalid_role", "Invalid role");
  if (!STATUSES.includes(newStatus)) throw new HttpError(400, "invalid_status", "Invalid status");
  if (birthDate !== undefined && !Number.isFinite(Date.parse(birthDate))) {
    throw new HttpError(400, "invalid_birthDate", "birthDate is not a valid date");
  }

  assertNotLastAdmin(user, { role: newRole, status: newStatus });

  const changed = [];
  if (role && role !== user.role) changed.push(`role:${user.role}->${role}`);
  if (status && status !== user.status) changed.push(`status:${user.status}->${status}`);
  if (birthDate !== undefined && birthDate !== user.birthDate) changed.push("birthDate");

  const updateExpression = newBirthDate !== user.birthDate
    ? "SET #r = :role, #s = :status, GSI2PK = :gpk, GSI2SK = :gsk, #birthDate = :bd, #age = :age, #consentEligible = :ce, #updatedAt = :at"
    : "SET #r = :role, #s = :status, GSI2PK = :gpk, GSI2SK = :gsk, #updatedAt = :at";

  const exprAttrNames = { "#r": "role", "#s": "status", "#updatedAt": "updatedAt" };
  const exprAttrValues = {
    ":role": { S: newRole },
    ":status": { S: newStatus },
    ":gpk": { S: `USER#ROLE#${newRole}` },
    ":gsk": { S: `USER#${userId}#${newStatus}` },
    ":at": { S: new Date().toISOString() },
  };
  if (newBirthDate !== user.birthDate) {
    const age = computeAge(newBirthDate);
    exprAttrNames["#birthDate"] = "birthDate";
    exprAttrNames["#age"] = "age";
    exprAttrNames["#consentEligible"] = "consentEligible";
    exprAttrValues[":bd"] = { S: newBirthDate };
    exprAttrValues[":age"] = { N: String(age) };
    exprAttrValues[":ce"] = { BOOL: age >= MIN_SELF_CONSENT_AGE };
  }

  await client.send(
    new CMD.update({
      TableName: TABLE,
      Key: { PK: { S: `USER#${userId}` }, SK: { S: "META" } },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: exprAttrNames,
      ExpressionAttributeValues: exprAttrValues,
    }),
  );

  await writeAudit({
    subjectType: "USER",
    subjectId: userId,
    actorId,
    actorRole,
    action: "admin_user_update",
    resource: "admin",
    detail: { changes: changed },
    ip,
  });

  return { ...publicUser(user), role: newRole, status: newStatus, birthDate: newBirthDate };
};

const assertNotLastAdmin = async (target, next) => {
  if (target.role !== "admin") return;
  if (next.role === "admin" && next.status === "active") return;
  const res = await client.send(
    new CMD.query({
      TableName: TABLE,
      IndexName: "RoleStatus",
      KeyConditionExpression: "GSI2PK = :pk AND begins_with(GSI2SK, :pre)",
      ExpressionAttributeValues: { ":pk": { S: "USER#ROLE#admin" }, ":pre": { S: "USER#" } },
    }),
  );
  const activeAdmins = (res.Items || []).filter((i) => i.status?.S === "active").length;
  const stillActiveAdmin = next.role === "admin" && next.status === "active";
  if (activeAdmins - (stillActiveAdmin ? 0 : 1) <= 0) {
    throw new HttpError(409, "last_admin", "Cannot modify or remove the last active admin");
  }
};

const updateUser = async (event, ctx) => {
  const userId = parseId(event.pathParameters, "id");
  const body = JSON.parse(event.body || "{}");
  const changes = {};
  if (body.status !== undefined) changes.status = body.status;
  if (body.role !== undefined) changes.role = body.role;
  if (body.birthDate !== undefined) changes.birthDate = body.birthDate;
  if (Object.keys(changes).length === 0) {
    throw new HttpError(400, "no_changes", "Provide status, role and/or birthDate");
  }
  if (userId === ctx.userId && changes.role && changes.role !== "admin") {
    throw new HttpError(400, "cannot_demote_self", "You cannot demote yourself");
  }

  const target = await getUser(userId);
  if (!target) throw new HttpError(404, "user_not_found", "User not found");

  // Student accounts are activated EXCLUSIVELY by the educator link flow
  // (POST /students/{id}/accounts/{userId}/link), which attributes the entity
  // and approves the account atomically. A manual `active` here would create an
  // orphan active account with no student entity (a state the UI cannot link and
  // the catalog wrongly shows as already-attributed) — so reject it outright.
  // `denied` remains allowed to block a self-registration; `pending` is a no-op.
  if (target.role === "student" && changes.status === "active") {
    throw new HttpError(409, "link_required", "Student accounts become active through the student-account link only");
  }

  if (ctx.role === "educator") {
    // Educators may only approve/deny responsable and student accounts.
    if (!["guardian", "student"].includes(target.role)) {
      throw new HttpError(403, "forbidden", "Educators can only approve responsable and student accounts");
    }
    if (changes.role !== undefined) throw new HttpError(403, "forbidden", "Educators cannot change roles");
    if (changes.birthDate !== undefined) throw new HttpError(403, "forbidden", "Educators cannot edit birth date");
    if (changes.status !== undefined && !["active", "denied"].includes(changes.status)) {
      throw new HttpError(400, "invalid_status", "Educators can only approve or deny an account");
    }
  }

  const user = await applyChanges(userId, ctx.userId, ctx.role, event.requestContext?.identity?.sourceIp, changes);
  return ok({ user });
};

const resetPassword = async (event, ctx) => {
  const userId = parseId(event.pathParameters, "id");
  const body = JSON.parse(event.body || "{}");
  if (!body.password || String(body.password).length < 8) {
    throw new HttpError(400, "weak_password", "Password must have at least 8 characters");
  }
  const user = await getUser(userId);
  if (!user) throw new HttpError(404, "user_not_found", "User not found");
  const passwordHash = await hashPassword(body.password);
  await client.send(
    new CMD.update({
      TableName: TABLE,
      Key: { PK: { S: `USER#${userId}` }, SK: { S: "META" } },
      UpdateExpression: "SET passwordHash = :ph",
      ExpressionAttributeValues: { ":ph": { S: passwordHash } },
    }),
  );
  await writeAudit({
    subjectType: "USER",
    subjectId: userId,
    actorId: ctx.userId,
    actorRole: ctx.role,
    action: "admin_reset_password",
    resource: "admin",
    ip: event.requestContext?.identity?.sourceIp,
  });
  return ok({ message: "password_reset" });
};

const deleteUser = async (event, ctx) => {
  const userId = parseId(event.pathParameters, "id");
  if (userId === ctx.userId) throw new HttpError(400, "cannot_delete_self", "You cannot delete your own account");
  const user = await getUser(userId);
  if (!user) throw new HttpError(404, "user_not_found", "User not found");

  const userItems = await getUserItems(userId);
  const links = userItems.filter((i) => i.SK.S === "META" || /^(GUARD|FOLLOW|STUDENT)#/.test(i.SK.S));

  if (user.role === "admin") {
    const res = await client.send(
      new CMD.query({
        TableName: TABLE,
        IndexName: "RoleStatus",
        KeyConditionExpression: "GSI2PK = :pk AND begins_with(GSI2SK, :pre)",
        ExpressionAttributeValues: { ":pk": { S: "USER#ROLE#admin" }, ":pre": { S: "USER#" } },
      }),
    );
    const activeAdmins = (res.Items || []).filter((i) => i.status?.S === "active").length;
    if (activeAdmins <= 1) throw new HttpError(409, "last_admin", "Cannot delete the last active admin");
  }

  await deleteLinkItems(links, userId);

  // Sessions for this user (via Lookup GSI1SK = USER#<id>).
  const sessions = await client.send(
    new CMD.query({
      TableName: TABLE,
      IndexName: "Lookup",
      KeyConditionExpression: "GSI1SK = :sk",
      ExpressionAttributeValues: { ":sk": { S: `USER#${userId}` } },
    }),
  );
  for (const s of sessions.Items || []) {
    await client.send(new CMD.delete({ TableName: TABLE, Key: { PK: s.PK, SK: s.SK } }));
  }
  // EMAIL reservation.
  if (user.email) {
    await client.send(new CMD.delete({ TableName: TABLE, Key: { PK: { S: `EMAIL#${user.email}` }, SK: { S: `EMAIL#${user.email}` } } }));
  }

  await writeAudit({
    subjectType: "USER",
    subjectId: userId,
    actorId: ctx.userId,
    actorRole: ctx.role,
    action: "admin_delete_user",
    resource: "admin",
    ip: event.requestContext?.identity?.sourceIp,
  });
  return ok({ message: "user_deleted" });
};

const getUserItems = async (userId) => {
  const res = await client.send(
    new CMD.query({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: { ":pk": { S: `USER#${userId}` }, ":sk": { S: "" } },
    }),
  );
  return res.Items || [];
};

const deleteLinkItems = async (items, userId) => {
  for (const item of items) {
    const sk = item.SK.S;
    const m = sk.match(/^(GUARD|FOLLOW|STUDENT)#(.+)$/);
    if (m) {
      const edge = m[1];
      const studentId = m[2];
      const reverseSk =
        edge === "GUARD" ? `GUARDIAN#${userId}` : edge === "FOLLOW" ? `EDUCATOR#${userId}` : `LOGIN#${userId}`;
      await client.send(new CMD.delete({ TableName: TABLE, Key: { PK: { S: `STUDENT#${studentId}` }, SK: { S: reverseSk } } }));
    }
    await client.send(new CMD.delete({ TableName: TABLE, Key: { PK: item.PK, SK: item.SK } }));
  }
};

export const lambdaHandler = async (event) => {
  try {
    const ctx = await requireAuth(event);
    const route = `${event.httpMethod} ${event.resource}`;
    const educatorRoutes = ["GET /admin/users", "PATCH /admin/users/{id}"];
    if (!["admin", "educator"].includes(ctx.role)) throw new HttpError(403, "forbidden", "Admin or educator only");
    if (ctx.role === "educator" && !educatorRoutes.includes(route)) {
      throw new HttpError(403, "forbidden", "Educators cannot perform this action");
    }
    switch (route) {
      case "GET /admin/users":
        return await listUsers(event, ctx);
      case "PATCH /admin/users/{id}":
        return await updateUser(event, ctx);
      case "POST /admin/users/{id}/password":
        return await resetPassword(event, ctx);
      case "DELETE /admin/users/{id}":
        return await deleteUser(event, ctx);
      default:
        throw new HttpError(404, "not_found", "Route not found");
    }
  } catch (err) {
    return errorResponse(err);
  }
};
