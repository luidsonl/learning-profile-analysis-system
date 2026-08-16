import { CMD, client, TABLE } from "../lib/db.mjs";
import { ok, errorResponse, parseBody, param, HttpError, noContent } from "../lib/http.mjs";
import { nowIso } from "../lib/ids.mjs";
import { requireKeys, assert } from "../lib/validate.mjs";
import { requireAuth } from "../lib/session.mjs";
import { auditChild, assertScopeChild } from "../lib/scope.mjs";

const STATUSES = ["proposed", "approved", "rejected", "published"];

const listRecommendations = async (event, ctx) => {
  const childId = param(event, "id");
  await assertScopeChild(childId, ctx);
  const res = await client.send(
    new CMD.query({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ScanIndexForward: false,
      ExpressionAttributeValues: { ":pk": { S: `CHILD#${childId}` }, ":sk": { S: "REC#" } },
    }),
  );
  let data = (res.Items || []).map((i) => ({
    recoId: i.recoId.S,
    kind: i.kind.S,
    title: i.title.S,
    text: i.text.S,
    tags: i.tags?.SS || [],
    status: i.status.S,
    visibility: i.visibility.S,
    source: i.source?.S || null,
    createdBy: i.createdBy.S,
    createdAt: i.createdAt.S,
    updatedAt: i.updatedAt?.S || null,
  }));
  if (ctx.role === "student") {
    data = data.filter((r) => r.status === "approved" || r.status === "published");
  }
  return ok({ data, count: data.length });
};

const proposeRecommendation = async (event, ctx) => {
  const childId = param(event, "id");
  assert(ctx.role === "educator" || ctx.role === "admin", "forbidden", "Only educators or admins can propose recommendations", 403);
  await assertScopeChild(childId, ctx);

  const body = parseBody(event);
  requireKeys(body, ["title", "text"]);
  const at = nowIso();
  const recoId = `${Date.now()}-manual`;

  await client.send(
    new CMD.put({
      TableName: TABLE,
      Item: {
        PK: { S: `CHILD#${childId}` },
        SK: { S: `REC#${recoId}` },
        type: { S: "recommendation" },
        recoId: { S: recoId },
        kind: { S: "manual" },
        title: { S: body.title },
        text: { S: body.text },
        tags: body.tags?.length ? { SS: body.tags } : { NULL: true },
        status: { S: "proposed" },
        visibility: { S: "private" },
        createdBy: { S: ctx.userId },
        createdAt: { S: at },
      },
    }),
  );
  await auditChild(childId, ctx, "recommendation_proposed", `child:${childId}`, { recoId });

  return ok({ childId, recoId }, 201);
};

const updateRecommendation = async (event, ctx) => {
  const childId = param(event, "id");
  const recoId = param(event, "recoId");
  assert(ctx.role === "educator" || ctx.role === "admin", "forbidden", "Only educators or admins can update recommendations", 403);
  await assertScopeChild(childId, ctx);

  const res = await client.send(
    new CMD.get({ TableName: TABLE, Key: { PK: { S: `CHILD#${childId}` }, SK: { S: `REC#${recoId}` } } }),
  );
  if (!res.Item) throw new HttpError(404, "recommendation_not_found", "Recommendation not found");

  const body = parseBody(event);
  const updates = [];
  const names = {};
  const values = {};
  if (body.status !== undefined) {
    assert(STATUSES.includes(body.status), "invalid_status", `status must be one of ${STATUSES.join(", ")}`);
    updates.push("#status = :status");
    names["#status"] = "status";
    values[":status"] = { S: body.status };
  }
  if (body.visibility !== undefined) {
    assert(["private", "published"].includes(body.visibility), "invalid_visibility", "visibility must be private or published");
    updates.push("#visibility = :visibility");
    names["#visibility"] = "visibility";
    values[":visibility"] = { S: body.visibility };
  }
  assert(updates.length > 0, "validation_failed", "Provide status and/or visibility to update");

  const at = nowIso();
  await client.send(
    new CMD.update({
      TableName: TABLE,
      Key: { PK: { S: `CHILD#${childId}` }, SK: { S: `REC#${recoId}` } },
      UpdateExpression: `SET ${updates.join(", ")}, #updatedAt = :updatedAt`,
      ExpressionAttributeNames: { ...names, "#updatedAt": "updatedAt" },
      ExpressionAttributeValues: { ...values, ":updatedAt": { S: at } },
    }),
  );
  await auditChild(childId, ctx, "recommendation_updated", `child:${childId}`, { recoId, updates });

  return ok({ childId, recoId });
};

const deleteRecommendation = async (event, ctx) => {
  const childId = param(event, "id");
  const recoId = param(event, "recoId");
  assert(ctx.role === "educator" || ctx.role === "admin", "forbidden", "Only educators or admins can delete recommendations", 403);
  await assertScopeChild(childId, ctx);

  await client.send(
    new CMD.delete({ TableName: TABLE, Key: { PK: { S: `CHILD#${childId}` }, SK: { S: `REC#${recoId}` } } }),
  );
  await auditChild(childId, ctx, "recommendation_deleted", `child:${childId}`, { recoId });

  return noContent();
};

export const lambdaHandler = async (event) => {
  try {
    const route = `${event.httpMethod} ${event.resource}`;
    const ctx = await requireAuth(event);
    switch (route) {
      case "GET /children/{id}/recommendations":
        return await listRecommendations(event, ctx);
      case "POST /children/{id}/recommendations":
        return await proposeRecommendation(event, ctx);
      case "PATCH /children/{id}/recommendations/{recoId}":
        return await updateRecommendation(event, ctx);
      case "DELETE /children/{id}/recommendations/{recoId}":
        return await deleteRecommendation(event, ctx);
      default:
        throw new HttpError(404, "not_found", "Route not found");
    }
  } catch (err) {
    return errorResponse(err);
  }
};
