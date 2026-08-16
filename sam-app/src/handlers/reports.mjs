import { GetObjectCommand, DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { CMD, client, TABLE } from "../lib/db.mjs";
import { ok, errorResponse, parseBody, param, HttpError, noContent } from "../lib/http.mjs";
import { uid, nowIso } from "../lib/ids.mjs";
import { requireAuth } from "../lib/session.mjs";
import { auditChild, assertScopeChild } from "../lib/scope.mjs";
import { getChild } from "./children.mjs";

const s3 = new S3Client({ region: process.env.AWS_REGION || process.env.REGION || "us-east-1" });
const FILES_BUCKET = process.env.FILES_BUCKET || "learning-profile-files";

const generateReport = async (event, ctx) => {
  const childId = param(event, "id");
  await assertScopeChild(childId, ctx);
  const child = await getChild(childId);
  if (!child) throw new HttpError(404, "child_not_found", "Child not found");

  const body = parseBody(event);
  const kind = body.kind || "profile";
  const at = nowIso();
  const reportId = uid();
  const report = {
    PK: { S: `REPORT#${childId}` },
    SK: { S: `REPORT#${reportId}` },
    type: { S: "report" },
    reportId: { S: reportId },
    childId: { S: childId },
    kind: { S: kind },
    status: { S: "queued" },
    s3Key: { S: `reports/${reportId}.pdf` },
    requestedBy: { S: ctx.userId },
    requestedByRole: { S: ctx.role },
    createdAt: { S: at },
    GSI1PK: { S: `REPORT#${reportId}` },
    GSI1SK: { S: `CHILD#${childId}` },
  };

  await client.send(new CMD.put({ TableName: TABLE, Item: report }));

  const queueUrl = process.env.REPORT_QUEUE_URL;
  if (queueUrl) {
    const { SQSClient, SendMessageCommand } = await import("@aws-sdk/client-sqs");
    const sqs = new SQSClient({ region: process.env.AWS_REGION || "us-east-1" });
    await sqs.send(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify({ childId, reportId, kind }),
      }),
    );
  }

  await auditChild(childId, ctx, "report_requested", `child:${childId}`, { reportId, kind });

  return ok({ reportId, childId, kind, status: "queued" }, 201);
};

const listReports = async (event, ctx) => {
  const childId = param(event, "id");
  await assertScopeChild(childId, ctx);
  const res = await client.send(
    new CMD.query({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ScanIndexForward: false,
      ExpressionAttributeValues: { ":pk": { S: `REPORT#${childId}` }, ":sk": { S: "REPORT#" } },
    }),
  );
  const data = (res.Items || []).map((i) => ({
    reportId: i.reportId.S,
    childId: i.childId.S,
    kind: i.kind.S,
    status: i.status.S,
    createdAt: i.createdAt.S,
    requestedBy: i.requestedBy.S,
  }));
  return ok({ data, count: data.length });
};

const downloadReport = async (event, ctx) => {
  const reportId = param(event, "reportId");
  const report = await client.send(
    new CMD.query({
      TableName: TABLE,
      IndexName: "Lookup",
      KeyConditionExpression: "GSI1PK = :pk",
      Limit: 1,
      ExpressionAttributeValues: { ":pk": { S: `REPORT#${reportId}` } },
    }),
  );
  const item = report.Items?.[0];
  if (!item) throw new HttpError(404, "report_not_found", "Report not found");
  await assertScopeChild(item.childId.S, ctx);
  if (item.status.S !== "generated") throw new HttpError(409, "report_not_ready", "Report is not generated yet");

  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: FILES_BUCKET, Key: item.s3Key.S }),
    { expiresIn: 900 },
  );
  return ok({ url, reportId, s3Key: item.s3Key.S, expiresIn: 900 });
};

const deleteReport = async (event, ctx) => {
  const reportId = param(event, "reportId");
  const report = await client.send(
    new CMD.query({
      TableName: TABLE,
      IndexName: "Lookup",
      KeyConditionExpression: "GSI1PK = :pk",
      Limit: 1,
      ExpressionAttributeValues: { ":pk": { S: `REPORT#${reportId}` } },
    }),
  );
  const item = report.Items?.[0];
  if (!item) throw new HttpError(404, "report_not_found", "Report not found");
  await assertScopeChild(item.childId.S, ctx);

  await client.send(new CMD.delete({ TableName: TABLE, Key: { PK: { S: `REPORT#${item.childId.S}` }, SK: { S: `REPORT#${reportId}` } } }));
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: FILES_BUCKET, Key: item.s3Key.S }));
  } catch (err) {
    console.warn("failed to delete s3 object", err.message);
  }
  await auditChild(item.childId.S, ctx, "report_deleted", `report:${reportId}`);

  return noContent();
};

export const lambdaHandler = async (event) => {
  try {
    const route = `${event.httpMethod} ${event.resource}`;
    const ctx = await requireAuth(event);
    switch (route) {
      case "POST /children/{id}/reports/generate":
        return await generateReport(event, ctx);
      case "GET /children/{id}/reports":
        return await listReports(event, ctx);
      case "GET /reports/{reportId}/download":
        return await downloadReport(event, ctx);
      case "DELETE /reports/{reportId}":
        return await deleteReport(event, ctx);
      default:
        throw new HttpError(404, "not_found", "Route not found");
    }
  } catch (err) {
    return errorResponse(err);
  }
};
