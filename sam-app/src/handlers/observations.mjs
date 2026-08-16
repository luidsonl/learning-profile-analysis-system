import { CMD, client, TABLE } from "../lib/db.mjs";
import { ok, errorResponse, parseBody, param, HttpError, noContent } from "../lib/http.mjs";
import { nowIso } from "../lib/ids.mjs";
import { requireKeys, assert } from "../lib/validate.mjs";
import { requireAuth } from "../lib/session.mjs";
import { auditChild, assertScopeChild, requireStudentAccess } from "../lib/scope.mjs";

const CATEGORIES = ["academic", "behavior", "social", "emotional", "attention", "other"];

const addObservation = async (event, ctx) => {
  const childId = param(event, "id");
  assert(ctx.role === "educator", "forbidden", "Only educators can add observations", 403);
  await assertScopeChild(childId, ctx);

  const body = parseBody(event);
  requireKeys(body, ["category", "text"]);
  assert(CATEGORIES.includes(body.category), "invalid_category", `category must be one of ${CATEGORIES.join(", ")}`);
  assert(String(body.text).trim().length > 0, "validation_failed", "text cannot be empty");

  const at = nowIso();
  const item = {
    PK: { S: `CHILD#${childId}` },
    SK: { S: `OBS#${at}` },
    type: { S: "observation" },
    category: { S: body.category },
    text: { S: body.text },
    rating: body.rating ? { N: String(body.rating) } : { NULL: true },
    submittedBy: { S: ctx.userId },
    createdAt: { S: at },
  };

  await client.send(new CMD.put({ TableName: TABLE, Item: item }));
  await auditChild(childId, ctx, "observation_added", `child:${childId}`, { category: body.category });

  return ok({ childId, observationTimestamp: at }, 201);
};

const listObservations = async (event, ctx) => {
  const childId = param(event, "id");
  await assertScopeChild(childId, ctx);
  await requireStudentAccess(childId, ctx, "observations_read");

  const res = await client.send(
    new CMD.query({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ScanIndexForward: false,
      ExpressionAttributeValues: { ":pk": { S: `CHILD#${childId}` }, ":sk": { S: "OBS#" } },
    }),
  );
  const data = (res.Items || []).map((i) => ({
    observationTimestamp: i.SK.S.replace("OBS#", ""),
    category: i.category.S,
    text: i.text.S,
    rating: i.rating?.N ? Number(i.rating.N) : null,
    submittedBy: i.submittedBy.S,
    createdAt: i.createdAt.S,
  }));
  return ok({ data, count: data.length });
};

const deleteObservation = async (event, ctx) => {
  const childId = param(event, "id");
  const timestamp = param(event, "timestamp");
  assert(ctx.role === "educator" || ctx.role === "admin", "forbidden", "Only educators or admins can delete observations", 403);
  await assertScopeChild(childId, ctx);

  const res = await client.send(
    new CMD.get({ TableName: TABLE, Key: { PK: { S: `CHILD#${childId}` }, SK: { S: `OBS#${timestamp}` } } }),
  );
  if (!res.Item) throw new HttpError(404, "observation_not_found", "Observation not found");
  assert(ctx.role === "admin" || res.Item.submittedBy.S === ctx.userId, "forbidden", "Only the author can delete this observation", 403);

  await client.send(new CMD.delete({ TableName: TABLE, Key: { PK: { S: `CHILD#${childId}` }, SK: { S: `OBS#${timestamp}` } } }));
  await auditChild(childId, ctx, "observation_deleted", `child:${childId}`, { timestamp });

  return noContent();
};

export const lambdaHandler = async (event) => {
  try {
    const route = `${event.httpMethod} ${event.resource}`;
    const ctx = await requireAuth(event);
    switch (route) {
      case "POST /children/{id}/observations":
        return await addObservation(event, ctx);
      case "GET /children/{id}/observations":
        return await listObservations(event, ctx);
      case "DELETE /children/{id}/observations/{timestamp}":
        return await deleteObservation(event, ctx);
      default:
        throw new HttpError(404, "not_found", "Route not found");
    }
  } catch (err) {
    return errorResponse(err);
  }
};
