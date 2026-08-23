import { CMD, client, TABLE } from "../lib/db.mjs";
import { ok, errorResponse, param, qparam, HttpError } from "../lib/http.mjs";
import { requireAuth } from "../lib/session.mjs";
import { assertScopeStudent } from "../lib/scope.mjs";

const asEvent = (i) => ({
  subject: i.PK.S.replace("AUDIT#", ""),
  actorId: i.actorId?.S || null,
  actorRole: i.actorRole?.S || null,
  action: i.action?.S || null,
  resource: i.resource?.S || null,
  detail: i.detail?.S ? JSON.parse(i.detail.S) : null,
  ip: i.ip?.S || null,
  createdAt: i.createdAt?.S || i.SK.S.replace("EVENT#", ""),
});

const studentAudit = async (event, ctx) => {
  const studentId = param(event, "id");
  if (ctx.role !== "admin") {
    await assertScopeStudent(studentId, ctx);
    if (ctx.role !== "guardian") throw new HttpError(403, "forbidden", "Only guardians or admins can read the audit trail");
  }
  const res = await client.send(
    new CMD.query({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ScanIndexForward: false,
      ExpressionAttributeValues: { ":pk": { S: `AUDIT#STUDENT#${studentId}` }, ":sk": { S: "EVENT#" } },
    }),
  );
  return ok({ data: (res.Items || []).map(asEvent), count: res.Items?.length || 0 });
};

const actorAudit = async (event, ctx) => {
  assert(ctx.role === "admin", "forbidden", "Only admins can read the actor audit trail", 403);
  const actorId = qparam(event, "actor");
  const pk = actorId ? `AUDIT#USER#${actorId}` : `AUDIT#USER#`;
  const res = await client.send(
    new CMD.query({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ScanIndexForward: false,
      ExpressionAttributeValues: { ":pk": { S: pk }, ":sk": { S: "EVENT#" } },
    }),
  );
  return ok({ data: (res.Items || []).map(asEvent), count: res.Items?.length || 0 });
};

export const lambdaHandler = async (event) => {
  try {
    const route = `${event.httpMethod} ${event.resource}`;
    const ctx = await requireAuth(event);
    switch (route) {
      case "GET /audit/students/{id}":
        return await studentAudit(event, ctx);
      case "GET /audit":
        return await actorAudit(event, ctx);
      default:
        throw new HttpError(404, "not_found", "Route not found");
    }
  } catch (err) {
    return errorResponse(err);
  }
};
