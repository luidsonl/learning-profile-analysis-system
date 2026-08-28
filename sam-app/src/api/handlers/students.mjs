import { unmarshall } from "@aws-sdk/util-dynamodb";
import { CMD, client, TABLE } from "../lib/db.mjs";
import { ok, errorResponse, parseBody, param, HttpError } from "../lib/http.mjs";
import { uid, nowIso } from "../lib/ids.mjs";
import { requireKeys, assert } from "../lib/validate.mjs";
import { requireAuth } from "../lib/session.mjs";
import { auditStudent, assertScopeStudent } from "../lib/scope.mjs";

export const getStudent = async (studentId) => {
  const res = await client.send(
    new CMD.get({ TableName: TABLE, Key: { PK: { S: `STUDENT#${studentId}` }, SK: { S: "META" } } }),
  );
  return res.Item ? { studentId, ...unmarshall(res.Item) } : null;
};

const createChild = async (event, ctx) => {
  const body = parseBody(event);
  requireKeys(body, ["name", "birthDate"]);
  assert(["educator", "admin"].includes(ctx.role), "forbidden", "Only educators and admins can register students", 403);

  const studentId = uid();
  const at = nowIso();
  const item = {
    PK: { S: `STUDENT#${studentId}` },
    SK: { S: "META" },
    type: { S: "student" },
    studentId: { S: studentId },
    name: { S: body.name },
    birthDate: { S: body.birthDate },
    gender: body.gender ? { S: body.gender } : { NULL: true },
    grade: body.grade ? { S: body.grade } : { NULL: true },
    school: body.school ? { S: body.school } : { NULL: true },
    specialNeeds: body.specialNeeds ? { SS: body.specialNeeds } : { NULL: true },
    status: { S: "active" },
    accountability: body.accountability ? { S: JSON.stringify(body.accountability) } : { NULL: true },
    createdBy: { S: ctx.userId },
    createdAt: { S: at },
    updatedAt: { S: at },
    GSI2PK: { S: "STUDENT#STATUS#active" },
    GSI2SK: { S: `STUDENT#${studentId}` },
  };

  const transact = {
    TransactItems: [
      { Put: { TableName: TABLE, Item: item, ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)" } },
    ],
  };
  if (ctx.role === "educator") {
    transact.TransactItems.push(
      {
        Put: {
          TableName: TABLE,
          Item: {
            PK: { S: `USER#${ctx.userId}` },
            SK: { S: `FOLLOW#${studentId}` },
            type: { S: "edge" },
            createdAt: { S: at },
          },
          ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)",
        },
      },
      {
        Put: {
          TableName: TABLE,
          Item: { PK: { S: `STUDENT#${studentId}` }, SK: { S: `EDUCATOR#${ctx.userId}` }, type: { S: "edge" }, createdAt: { S: at } },
          ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)",
        },
      },
    );
  }

  await client.send(new CMD.transact(transact));
  await auditStudent(studentId, ctx, "create", `student:${studentId}`, { name: body.name });

  return ok({ studentId }, 201);
};

const listChildren = async (event, ctx) => {
  const items = [];
  if (ctx.role === "guardian") {
    const res = await client.send(
      new CMD.query({ TableName: TABLE, KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)", ExpressionAttributeValues: { ":pk": { S: `USER#${ctx.userId}` }, ":sk": { S: "GUARD#" } } }),
    );
    for (const edge of res.Items || []) {
      const studentId = edge.SK.S.replace("GUARD#", "");
      const student = await getStudent(studentId);
      if (student) items.push(student);
    }
  } else if (ctx.role === "educator") {
    const res = await client.send(
      new CMD.query({ TableName: TABLE, KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)", ExpressionAttributeValues: { ":pk": { S: `USER#${ctx.userId}` }, ":sk": { S: "FOLLOW#" } } }),
    );
    for (const edge of res.Items || []) {
      const studentId = edge.SK.S.replace("FOLLOW#", "");
      const student = await getStudent(studentId);
      if (student) items.push(student);
    }
  } else if (ctx.role === "admin") {
    const res = await client.send(
      new CMD.query({ TableName: TABLE, IndexName: "RoleStatus", KeyConditionExpression: "GSI2PK = :pk", ExpressionAttributeValues: { ":pk": { S: "STUDENT#STATUS#active" } } }),
    );
    for (const item of res.Items || []) {
      const plain = unmarshall(item);
      items.push(plain);
    }
  } else {
    throw new HttpError(403, "forbidden", "Students cannot list students");
  }
  return ok({ data: items, count: items.length });
};

const getStudentHandler = async (event, ctx) => {
  const studentId = param(event, "id");
  await assertScopeStudent(studentId, ctx);
  const student = await getStudent(studentId);
  if (!student) throw new HttpError(404, "student_not_found", "Student not found");
  return ok({ student });
};

const updateChild = async (event, ctx) => {
  const studentId = param(event, "id");
  await assertScopeStudent(studentId, ctx);
  const student = await getStudent(studentId);
  if (!student) throw new HttpError(404, "student_not_found", "Student not found");

  const body = parseBody(event);
  if (ctx.role === "student") {
    assert(body.name !== undefined && body.name !== student.name, "validation_failed", "Students can only edit their own name");
  }
  const allowed = ctx.role === "student" ? ["name"] : ["name", "birthDate", "gender", "grade", "school", "specialNeeds"];
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
      Key: { PK: { S: `STUDENT#${studentId}` }, SK: { S: "META" } },
      UpdateExpression: `SET ${updateExpression}, #updatedAt = :updatedAt`,
      ExpressionAttributeNames: { ...exprAttrNames, "#updatedAt": "updatedAt" },
      ExpressionAttributeValues: exprAttrValues,
      ReturnValues: "ALL_NEW",
    }),
  );
  await auditStudent(studentId, ctx, "update", `student:${studentId}`, { updated: updateAttrs });

  return ok({ studentId, updated: updateAttrs });
};

export const lambdaHandler = async (event) => {
  try {
    const route = `${event.httpMethod} ${event.resource}`;
    const ctx = await requireAuth(event);
    switch (route) {
      case "POST /students":
        return await createChild(event, ctx);
      case "GET /students":
        return await listChildren(event, ctx);
      case "GET /students/{id}":
        return await getStudentHandler(event, ctx);
      case "PATCH /students/{id}":
        return await updateChild(event, ctx);
      default:
        throw new HttpError(404, "not_found", "Route not found");
    }
  } catch (err) {
    return errorResponse(err);
  }
};
