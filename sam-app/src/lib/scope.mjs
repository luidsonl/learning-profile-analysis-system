import { CMD, client, TABLE } from "./db.mjs";
import { HttpError } from "./http.mjs";
import { nowIso } from "./ids.mjs";

export const writeAudit = async ({ subjectType, subjectId, actorId, actorRole, action, resource, detail, ip }) => {
  const at = nowIso();
  await client.send(
    new CMD.put({
      TableName: TABLE,
      Item: {
        PK: { S: `AUDIT#${subjectType}#${subjectId}` },
        SK: { S: `EVENT#${at}` },
        actorId: { S: actorId },
        actorRole: { S: actorRole },
        action: { S: action },
        resource: { S: resource },
        detail: detail ? { S: JSON.stringify(detail) } : { NULL: true },
        ip: { S: ip || "" },
        createdAt: { S: at },
      },
    }),
  );
};

export const auditChild = (childId, ctx, action, resource, detail, ip) =>
  writeAudit({
    subjectType: "CHILD",
    subjectId: childId,
    actorId: ctx.userId,
    actorRole: ctx.role,
    action,
    resource,
    detail,
    ip,
  });

export const assertScopeChild = async (childId, ctx) => {
  if (ctx.role === "admin") return;
  const key = { PK: { S: `USER#${ctx.userId}` }, SK: { S: "META" } };
  let sk;
  if (ctx.role === "guardian") sk = `GUARD#${childId}`;
  else if (ctx.role === "educator") sk = `FOLLOW#${childId}`;
  else if (ctx.role === "student") sk = `CHILD#${childId}`;
  else throw new HttpError(403, "forbidden", "Role cannot access children");

  const res = await client.send(new CMD.get({ TableName: TABLE, Key: { ...key, SK: { S: sk } } }));
  if (!res.Item) throw new HttpError(403, "forbidden", "No access to this child");
};

export const getStudentChildId = async (studentUserId) => {
  const res = await client.send(
    new CMD.query({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      Limit: 1,
      ExpressionAttributeValues: { ":pk": { S: `USER#${studentUserId}` }, ":sk": { S: "CHILD#" } },
    }),
  );
  const edge = res.Items?.[0];
  return edge ? edge.SK.S.replace("CHILD#", "") : null;
};
