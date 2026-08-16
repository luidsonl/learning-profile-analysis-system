import { CMD, client, TABLE } from "../lib/db.mjs";
import { ok, errorResponse, parseBody, param, HttpError } from "../lib/http.mjs";
import { nowIso } from "../lib/ids.mjs";
import { requireKeys, assert } from "../lib/validate.mjs";
import { requireAuth } from "../lib/session.mjs";
import { auditChild, assertScopeChild, AUTONOMY_LEVELS } from "../lib/scope.mjs";
import { getChild } from "./children.mjs";

const setAutonomy = async (event, ctx) => {
  const childId = param(event, "id");
  assert(["guardian", "educator", "admin"].includes(ctx.role), "forbidden", "Only guardians, educators or admins can set autonomy", 403);
  await assertScopeChild(childId, ctx);
  const child = await getChild(childId);
  if (!child) throw new HttpError(404, "child_not_found", "Child not found");

  const body = parseBody(event);
  requireKeys(body, ["level"]);
  assert(AUTONOMY_LEVELS.includes(body.level), "invalid_level", `level must be one of ${AUTONOMY_LEVELS.join(", ")}`);

  const at = nowIso();
  await client.send(
    new CMD.transact({
      TransactItems: [
        {
          Put: {
            TableName: TABLE,
            Item: {
              PK: { S: `AUTONOMY#${childId}` },
              SK: { S: `AUTONOMY#${at}` },
              type: { S: "autonomy" },
              childId: { S: childId },
              level: { S: body.level },
              setBy: { S: ctx.userId },
              setByRole: { S: ctx.role },
              reason: body.reason ? { S: String(body.reason) } : { NULL: true },
              createdAt: { S: at },
            },
          },
        },
        {
          Update: {
            TableName: TABLE,
            Key: { PK: { S: `CHILD#${childId}` }, SK: { S: "META" } },
            UpdateExpression: "SET #autonomyLevel = :lvl, #autonomyUpdatedAt = :at, #autonomyUpdatedBy = :by, #updatedAt = :at",
            ExpressionAttributeNames: {
              "#autonomyLevel": "autonomyLevel",
              "#autonomyUpdatedAt": "autonomyUpdatedAt",
              "#autonomyUpdatedBy": "autonomyUpdatedBy",
              "#updatedAt": "updatedAt",
            },
            ExpressionAttributeValues: {
              ":lvl": { S: body.level },
              ":at": { S: at },
              ":by": { S: ctx.userId },
            },
          },
        },
      ],
    }),
  );

  await auditChild(childId, ctx, "autonomy_changed", `child:${childId}`, { level: body.level, reason: body.reason || null });

  return ok({ childId, level: body.level, updatedAt: at });
};

const getAutonomy = async (event, ctx) => {
  const childId = param(event, "id");
  await assertScopeChild(childId, ctx);
  const child = await getChild(childId);
  if (!child) throw new HttpError(404, "child_not_found", "Child not found");

  const res = await client.send(
    new CMD.query({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ScanIndexForward: false,
      ExpressionAttributeValues: { ":pk": { S: `AUTONOMY#${childId}` }, ":sk": { S: "AUTONOMY#" } },
    }),
  );
  const history = (res.Items || []).map((i) => ({
    level: i.level.S,
    setBy: i.setBy.S,
    setByRole: i.setByRole.S,
    reason: i.reason?.S || null,
    createdAt: i.createdAt.S,
  }));

  return ok({
    current: {
      level: child.autonomyLevel || "supervised",
      updatedAt: child.autonomyUpdatedAt || null,
      updatedBy: child.autonomyUpdatedBy || null,
    },
    history,
  });
};

export const lambdaHandler = async (event) => {
  try {
    const route = `${event.httpMethod} ${event.resource}`;
    const ctx = await requireAuth(event);
    switch (route) {
      case "GET /children/{id}/autonomy":
        return await getAutonomy(event, ctx);
      case "PATCH /children/{id}/autonomy":
        return await setAutonomy(event, ctx);
      default:
        throw new HttpError(404, "not_found", "Route not found");
    }
  } catch (err) {
    return errorResponse(err);
  }
};
