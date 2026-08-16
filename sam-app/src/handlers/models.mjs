import { CMD, client, TABLE } from "../lib/db.mjs";
import { ok, errorResponse, parseBody, param, qparam, HttpError } from "../lib/http.mjs";
import { nowIso } from "../lib/ids.mjs";
import { requireKeys, assert } from "../lib/validate.mjs";
import { requireAuth } from "../lib/session.mjs";
import { writeAudit } from "../lib/scope.mjs";

const STATUSES = ["active", "retired", "draft"];

const asModel = (i) => ({
  name: i.name.S,
  version: i.version.S,
  type: i.type?.S || null,
  description: i.description?.S || null,
  status: i.status?.S || "draft",
  artifact: i.artifact?.S || null,
  metric: i.metric?.S ? JSON.parse(i.metric.S) : null,
  createdAt: i.createdAt?.S || null,
});

const listModels = async (event, ctx) => {
  assert(ctx.role === "admin", "forbidden", "Only admins can list models", 403);
  const requested = qparam(event, "status");
  const statuses = requested ? [requested] : STATUSES;
  const items = [];
  for (const status of statuses) {
    const res = await client.send(
      new CMD.query({
        TableName: TABLE,
        IndexName: "RoleStatus",
        KeyConditionExpression: "GSI2PK = :pk",
        ExpressionAttributeValues: { ":pk": { S: `MODEL#STATUS#${status}` } },
      }),
    );
    for (const i of res.Items || []) items.push(asModel(i));
  }
  return ok({ data: items, count: items.length });
};

const getModel = async (event, ctx) => {
  assert(ctx.role === "admin", "forbidden", "Only admins can view models", 403);
  const name = param(event, "name");
  const res = await client.send(
    new CMD.query({ TableName: TABLE, KeyConditionExpression: "PK = :pk", ExpressionAttributeValues: { ":pk": { S: `MODEL#${name}` } } }),
  );
  const versions = (res.Items || []).map((i) => asModel(i)).sort((a, b) => b.version.localeCompare(a.version));
  if (versions.length === 0) throw new HttpError(404, "model_not_found", `Model ${name} not found`);
  return ok({ name, versions });
};

const activateModel = async (event, ctx) => {
  assert(ctx.role === "admin", "forbidden", "Only admins can manage models", 403);
  const name = param(event, "name");
  const body = parseBody(event);
  requireKeys(body, ["version"]);

  const res = await client.send(
    new CMD.get({ TableName: TABLE, Key: { PK: { S: `MODEL#${name}` }, SK: { S: `VERSION#${body.version}` } } }),
  );
  if (!res.Item) throw new HttpError(404, "model_version_not_found", `Model ${name} v${body.version} not found`);

  await client.send(
    new CMD.update({
      TableName: TABLE,
      Key: { PK: { S: `MODEL#${name}` }, SK: { S: `VERSION#${body.version}` } },
      UpdateExpression: "SET #status = :active, #updatedAt = :at, GSI2PK = :gpk",
      ExpressionAttributeNames: { "#status": "status", "#updatedAt": "updatedAt" },
      ExpressionAttributeValues: {
        ":active": { S: "active" },
        ":at": { S: nowIso() },
        ":gpk": { S: "MODEL#STATUS#active" },
      },
    }),
  );
  await writeAudit({ subjectType: "MODEL", subjectId: name, actorId: ctx.userId, actorRole: ctx.role, action: "model_activated", resource: `model:${name}` });

  return ok({ name, version: body.version, status: "active" });
};

const retireModel = async (event, ctx) => {
  assert(ctx.role === "admin", "forbidden", "Only admins can manage models", 403);
  const name = param(event, "name");
  const body = parseBody(event);
  requireKeys(body, ["version"]);

  const res = await client.send(
    new CMD.get({ TableName: TABLE, Key: { PK: { S: `MODEL#${name}` }, SK: { S: `VERSION#${body.version}` } } }),
  );
  if (!res.Item) throw new HttpError(404, "model_version_not_found", `Model ${name} v${body.version} not found`);

  await client.send(
    new CMD.update({
      TableName: TABLE,
      Key: { PK: { S: `MODEL#${name}` }, SK: { S: `VERSION#${body.version}` } },
      UpdateExpression: "SET #status = :retired, #updatedAt = :at, GSI2PK = :gpk",
      ExpressionAttributeNames: { "#status": "status", "#updatedAt": "updatedAt" },
      ExpressionAttributeValues: {
        ":retired": { S: "retired" },
        ":at": { S: nowIso() },
        ":gpk": { S: "MODEL#STATUS#retired" },
      },
    }),
  );
  await writeAudit({ subjectType: "MODEL", subjectId: name, actorId: ctx.userId, actorRole: ctx.role, action: "model_retired", resource: `model:${name}` });

  return ok({ name, version: body.version, status: "retired" });
};

export const lambdaHandler = async (event) => {
  try {
    const route = `${event.httpMethod} ${event.resource}`;
    const ctx = await requireAuth(event);
    switch (route) {
      case "GET /models":
        return await listModels(event, ctx);
      case "GET /models/{name}":
        return await getModel(event, ctx);
      case "POST /models/{name}/activate":
        return await activateModel(event, ctx);
      case "POST /models/{name}/retire":
        return await retireModel(event, ctx);
      default:
        throw new HttpError(404, "not_found", "Route not found");
    }
  } catch (err) {
    return errorResponse(err);
  }
};
