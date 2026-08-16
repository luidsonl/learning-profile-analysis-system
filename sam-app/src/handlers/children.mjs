import { unmarshall } from "@aws-sdk/util-dynamodb";
import { CMD, client, TABLE } from "../lib/db.mjs";
import { ok, errorResponse, parseBody, param, HttpError } from "../lib/http.mjs";
import { uid, nowIso } from "../lib/ids.mjs";
import { requireKeys, assert } from "../lib/validate.mjs";
import { requireAuth } from "../lib/session.mjs";
import { auditChild, assertScopeChild } from "../lib/scope.mjs";

export const getChild = async (childId) => {
  const res = await client.send(
    new CMD.get({ TableName: TABLE, Key: { PK: { S: `CHILD#${childId}` }, SK: { S: "META" } } }),
  );
  return res.Item ? { childId, ...unmarshall(res.Item) } : null;
};

const createChild = async (event, ctx) => {
  const body = parseBody(event);
  requireKeys(body, ["name", "birthDate"]);
  assert(["guardian", "educator", "admin"].includes(ctx.role), "forbidden", "Role cannot register children", 403);

  const childId = uid();
  const at = nowIso();
  const item = {
    PK: { S: `CHILD#${childId}` },
    SK: { S: "META" },
    type: { S: "child" },
    childId: { S: childId },
    name: { S: body.name },
    birthDate: { S: body.birthDate },
    gender: body.gender ? { S: body.gender } : { NULL: true },
    grade: body.grade ? { S: body.grade } : { NULL: true },
    school: body.school ? { S: body.school } : { NULL: true },
    specialNeeds: body.specialNeeds ? { SS: body.specialNeeds } : { NULL: true },
    status: { S: "active" },
    createdBy: { S: ctx.userId },
    createdAt: { S: at },
    updatedAt: { S: at },
    GSI2PK: { S: "CHILD#STATUS#active" },
    GSI2SK: { S: `CHILD#${childId}` },
  };

  const transact = {
    TransactItems: [
      { Put: { TableName: TABLE, Item: item, ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)" } },
    ],
  };
  if (ctx.role === "guardian") {
    transact.TransactItems.push(
      {
        Put: {
          TableName: TABLE,
          Item: {
            PK: { S: `USER#${ctx.userId}` },
            SK: { S: `GUARD#${childId}` },
            type: { S: "edge" },
            relation: { S: body.relation || "guardian" },
            createdAt: { S: at },
          },
          ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)",
        },
      },
      {
        Put: {
          TableName: TABLE,
          Item: { PK: { S: `CHILD#${childId}` }, SK: { S: `GUARDIAN#${ctx.userId}` }, type: { S: "edge" }, createdAt: { S: at } },
          ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)",
        },
      },
    );
  } else if (ctx.role === "educator") {
    transact.TransactItems.push(
      {
        Put: {
          TableName: TABLE,
          Item: {
            PK: { S: `USER#${ctx.userId}` },
            SK: { S: `FOLLOW#${childId}` },
            type: { S: "edge" },
            createdAt: { S: at },
          },
          ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)",
        },
      },
      {
        Put: {
          TableName: TABLE,
          Item: { PK: { S: `CHILD#${childId}` }, SK: { S: `EDUCATOR#${ctx.userId}` }, type: { S: "edge" }, createdAt: { S: at } },
          ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)",
        },
      },
    );
  }

  await client.send(new CMD.transact(transact));
  await auditChild(childId, ctx, "create", `child:${childId}`, { name: body.name });

  return ok({ childId }, 201);
};

const listChildren = async (event, ctx) => {
  const items = [];
  if (ctx.role === "guardian") {
    const res = await client.send(
      new CMD.query({ TableName: TABLE, KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)", ExpressionAttributeValues: { ":pk": { S: `USER#${ctx.userId}` }, ":sk": { S: "GUARD#" } } }),
    );
    for (const edge of res.Items || []) {
      const childId = edge.SK.S.replace("GUARD#", "");
      const child = await getChild(childId);
      if (child) items.push(child);
    }
  } else if (ctx.role === "educator") {
    const res = await client.send(
      new CMD.query({ TableName: TABLE, KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)", ExpressionAttributeValues: { ":pk": { S: `USER#${ctx.userId}` }, ":sk": { S: "FOLLOW#" } } }),
    );
    for (const edge of res.Items || []) {
      const childId = edge.SK.S.replace("FOLLOW#", "");
      const child = await getChild(childId);
      if (child) items.push(child);
    }
  } else if (ctx.role === "admin") {
    const res = await client.send(
      new CMD.query({ TableName: TABLE, IndexName: "RoleStatus", KeyConditionExpression: "GSI2PK = :pk", ExpressionAttributeValues: { ":pk": { S: "CHILD#STATUS#active" } } }),
    );
    for (const item of res.Items || []) {
      const plain = unmarshall(item);
      items.push(plain);
    }
  } else {
    throw new HttpError(403, "forbidden", "Students cannot list children");
  }
  return ok({ data: items, count: items.length });
};

const getChildHandler = async (event, ctx) => {
  const childId = param(event, "id");
  await assertScopeChild(childId, ctx);
  const child = await getChild(childId);
  if (!child) throw new HttpError(404, "child_not_found", "Child not found");
  return ok({ child });
};

const updateChild = async (event, ctx) => {
  const childId = param(event, "id");
  await assertScopeChild(childId, ctx);
  const child = await getChild(childId);
  if (!child) throw new HttpError(404, "child_not_found", "Child not found");

  const body = parseBody(event);
  const allowed = ["name", "birthDate", "gender", "grade", "school", "specialNeeds"];
  const updateAttrs = allowed.filter((k) => body[k] !== undefined);
  assert(updateAttrs.length > 0, "validation_failed", "No updatable fields provided");

  const updateExpression = updateAttrs.map((k) => `#${k} = :${k}`).join(", ");
  const exprAttrNames = Object.fromEntries(updateAttrs.map((k) => [`#${k}`, k]));
  const exprAttrValues = Object.fromEntries(
    updateAttrs.map((k) => [`:${k}`, Array.isArray(body[k]) ? { SS: body[k] } : { S: String(body[k]) }]),
  );
  exprAttrValues[":updatedAt"] = { S: nowIso() };

  await client.send(
    new CMD.update({
      TableName: TABLE,
      Key: { PK: { S: `CHILD#${childId}` }, SK: { S: "META" } },
      UpdateExpression: `SET ${updateExpression}, #updatedAt = :updatedAt`,
      ExpressionAttributeNames: { ...exprAttrNames, "#updatedAt": "updatedAt" },
      ExpressionAttributeValues: exprAttrValues,
      ReturnValues: "ALL_NEW",
    }),
  );
  await auditChild(childId, ctx, "update", `child:${childId}`, { updated: updateAttrs });

  return ok({ childId, updated: updateAttrs });
};

export const lambdaHandler = async (event) => {
  try {
    const route = `${event.httpMethod} ${event.resource}`;
    const ctx = await requireAuth(event);
    switch (route) {
      case "POST /children":
        return await createChild(event, ctx);
      case "GET /children":
        return await listChildren(event, ctx);
      case "GET /children/{id}":
        return await getChildHandler(event, ctx);
      case "PATCH /children/{id}":
        return await updateChild(event, ctx);
      default:
        throw new HttpError(404, "not_found", "Route not found");
    }
  } catch (err) {
    return errorResponse(err);
  }
};
