import { unmarshall } from "@aws-sdk/util-dynamodb";
import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { CMD, client, TABLE } from "../lib/db.mjs";
import { ok, errorResponse, parseBody, param, HttpError, noContent } from "../lib/http.mjs";
import { uid, nowIso } from "../lib/ids.mjs";
import { requireKeys, assert } from "../lib/validate.mjs";
import { requireAuth } from "../lib/session.mjs";
import { getUser } from "../lib/auth.mjs";
import { auditStudent, assertScopeStudent, writeAudit } from "../lib/scope.mjs";

const s3 = new S3Client({ region: process.env.AWS_REGION || process.env.REGION || "us-east-1" });
const FILES_BUCKET = process.env.FILES_BUCKET || "learning-profile-files";

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
  // Existence precedes authorization: an erased/unknown record is a plain 404
  // for every persona (no existence leak via 403 vs 404, and after LGPD erasure
  // the record is gone for everyone), while a live-but-unscoped record stays 403.
  const student = await getStudent(studentId);
  if (!student) throw new HttpError(404, "student_not_found", "Student not found");
  await assertScopeStudent(studentId, ctx);

  // Related users of the entity (specs/backend.md): the linked self-registered
  // account, when present. Denormalized here so the ficha can show it directly.
  let studentUser = null;
  if (student.studentUserId) {
    const u = await getUser(student.studentUserId);
    if (u) studentUser = { userId: u.userId, name: u.name, email: u.email, status: u.status };
  }
  return ok({ student: { ...student, studentUser } });
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

const deletePartition = async (pk) => {
  let last = undefined;
  do {
    const res = await client.send(
      new CMD.query({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": { S: pk } },
        ExclusiveStartKey: last,
      }),
    );
    for (const item of res.Items || []) {
      await client.send(new CMD.delete({ TableName: TABLE, Key: { PK: item.PK, SK: item.SK } }));
    }
    last = res.LastEvaluatedKey;
  } while (last);
};

const deleteUserAccount = async (userId, email) => {
  await deletePartition(`USER#${userId}`);
  if (email) {
    await client.send(new CMD.delete({ TableName: TABLE, Key: { PK: { S: `EMAIL#${email}` }, SK: { S: `EMAIL#${email}` } } }));
  }
};

const deleteChild = async (event, ctx) => {
  const studentId = param(event, "id");
  assert(["educator", "admin"].includes(ctx.role), "forbidden", "Only educators and admins can delete students", 403);
  await assertScopeStudent(studentId, ctx);
  const student = await getStudent(studentId);
  if (!student) throw new HttpError(404, "student_not_found", "Student not found");

  // Reads the student partition up front: META (linked self-account), the
  // reverse edges (user-side GUARD#/FOLLOW#/STUDENT# cleanup) and report keys.
  const partition = await client.send(
    new CMD.query({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: { ":pk": { S: `STUDENT#${studentId}` } },
    }),
  );
  const userEdges = [];
  const reportKeys = [];
  for (const item of partition.Items || []) {
    const sk = item.SK?.S || "";
    const m = sk.match(/^(GUARDIAN|EDUCATOR|LOGIN)#(.+)$/);
    if (m) userEdges.push({ kind: m[1], userId: m[2] });
    if (sk.startsWith("REPORT#") && item.s3Key?.S) reportKeys.push(item.s3Key.S);
  }

  // 1) Erasure across the student's own partitions (STUDENT#, CONSENT#, ASSESS#, PRED#, REPORT#).
  await deletePartition(`STUDENT#${studentId}`);
  await deletePartition(`CONSENT#${studentId}`);
  await deletePartition(`ASSESS#${studentId}`);
  await deletePartition(`PRED#${studentId}`);
  await deletePartition(`REPORT#${studentId}`);

  // 2) Reverse edges on the users who guard / follow / are linked to this student.
  for (const edge of userEdges) {
    const reverseSk = edge.kind === "GUARDIAN" ? `GUARD#${studentId}` : edge.kind === "EDUCATOR" ? `FOLLOW#${studentId}` : `STUDENT#${studentId}`;
    await client.send(new CMD.delete({ TableName: TABLE, Key: { PK: { S: `USER#${edge.userId}` }, SK: { S: reverseSk } } }));
  }

  // 3) Linked self-registered account: erase the USER partition + EMAIL reservation.
  if (student.studentUserId) {
    const userRes = await client.send(
      new CMD.get({ TableName: TABLE, Key: { PK: { S: `USER#${student.studentUserId}` }, SK: { S: "META" } } }),
    );
    const linkedEmail = userRes.Item?.email?.S;
    await deleteUserAccount(student.studentUserId, linkedEmail);
    await writeAudit({
      subjectType: "USER",
      subjectId: student.studentUserId,
      actorId: ctx.userId,
      actorRole: ctx.role,
      action: "student_linked_account_deleted",
      resource: `student:${studentId}`,
      detail: { email: linkedEmail || null },
      ip: event.requestContext?.identity?.sourceIp,
    });
  }

  // 4) Report artifacts in S3 (best effort — the DB row is already gone).
  for (const key of reportKeys) {
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: FILES_BUCKET, Key: key }));
    } catch (err) {
      console.warn("failed to delete report artifact", key, err.message);
    }
  }

  // 5) Audit of the deletion stays behind (LGPD accountability — the AUDIT# partition is preserved).
  await auditStudent(studentId, ctx, "student_deleted", `student:${studentId}`, { linkedAccount: student.studentUserId || null });

  return noContent();
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
      case "DELETE /students/{id}":
        return await deleteChild(event, ctx);
      default:
        throw new HttpError(404, "not_found", "Route not found");
    }
  } catch (err) {
    return errorResponse(err);
  }
};
