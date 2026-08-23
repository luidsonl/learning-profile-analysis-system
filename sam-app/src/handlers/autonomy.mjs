import { CMD, client, TABLE } from "../lib/db.mjs";
import { ok, errorResponse, parseBody, param, HttpError } from "../lib/http.mjs";
import { nowIso } from "../lib/ids.mjs";
import { requireKeys, assert } from "../lib/validate.mjs";
import { requireAuth } from "../lib/session.mjs";
import { auditStudent, assertScopeStudent, AUTONOMY_LEVELS } from "../lib/scope.mjs";
import { getStudent } from "./students.mjs";

const setAutonomy = async (event, ctx) => {
  const studentId = param(event, "id");
  assert(["guardian", "educator", "admin"].includes(ctx.role), "forbidden", "Only guardians, educators or admins can set autonomy", 403);
  await assertScopeStudent(studentId, ctx);
  const student = await getStudent(studentId);
  if (!student) throw new HttpError(404, "student_not_found", "Child not found");

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
              PK: { S: `AUTONOMY#${studentId}` },
              SK: { S: `AUTONOMY#${at}` },
              type: { S: "autonomy" },
              studentId: { S: studentId },
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
            Key: { PK: { S: `STUDENT#${studentId}` }, SK: { S: "META" } },
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

  await auditStudent(studentId, ctx, "autonomy_changed", `student:${studentId}`, { level: body.level, reason: body.reason || null });

  return ok({ studentId, level: body.level, updatedAt: at });
};

const getAutonomy = async (event, ctx) => {
  const studentId = param(event, "id");
  await assertScopeStudent(studentId, ctx);
  const student = await getStudent(studentId);
  if (!student) throw new HttpError(404, "student_not_found", "Child not found");

  const res = await client.send(
    new CMD.query({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ScanIndexForward: false,
      ExpressionAttributeValues: { ":pk": { S: `AUTONOMY#${studentId}` }, ":sk": { S: "AUTONOMY#" } },
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
      level: student.autonomyLevel || "supervised",
      updatedAt: student.autonomyUpdatedAt || null,
      updatedBy: student.autonomyUpdatedBy || null,
    },
    history,
  });
};

export const lambdaHandler = async (event) => {
  try {
    const route = `${event.httpMethod} ${event.resource}`;
    const ctx = await requireAuth(event);
    switch (route) {
      case "GET /students/{id}/autonomy":
        return await getAutonomy(event, ctx);
      case "PATCH /students/{id}/autonomy":
        return await setAutonomy(event, ctx);
      default:
        throw new HttpError(404, "not_found", "Route not found");
    }
  } catch (err) {
    return errorResponse(err);
  }
};
