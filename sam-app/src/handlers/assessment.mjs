import { CMD, client, TABLE } from "../lib/db.mjs";
import { ok, errorResponse, param, HttpError } from "../lib/http.mjs";
import { nowIso } from "../lib/ids.mjs";
import { requireAuth } from "../lib/session.mjs";
import { auditChild, assertScopeChild, studentAccess } from "../lib/scope.mjs";
import { getAssessmentProcessor } from "../forms/engine.mjs";
import { classifyLatestSubmission } from "../forms/classify.mjs";

const runAssessment = async (event, ctx) => {
  const childId = param(event, "id");
  await assertScopeChild(childId, ctx);

  const processor = getAssessmentProcessor();
  if (!processor) throw new HttpError(404, "no_assessment_processor", "No assessment processor registered");

  const result = await classifyLatestSubmission(childId, processor.formId);
  if (!result) throw new HttpError(404, "no_submission", "No assessment submission available yet");

  const at = nowIso();
  await client.send(
    new CMD.put({
      TableName: TABLE,
      Item: {
        PK: { S: `ASSESS#${childId}` },
        SK: { S: `VARK#${at}` },
        type: { S: "assessment" },
        kind: { S: "vark" },
        scores: { S: JSON.stringify(result.scores) },
        label: { S: result.label },
        multimodal: { BOOL: result.multimodal },
        method: { S: result.method },
        submission: { S: result.submission },
        createdAt: { S: at },
      },
    }),
  );

  await client.send(
    new CMD.update({
      TableName: TABLE,
      Key: { PK: { S: `CHILD#${childId}` }, SK: { S: "META" } },
      UpdateExpression: "SET #varkLabel = :l, #varkScores = :s, #varkMultimodal = :m, #updatedAt = :at",
      ExpressionAttributeNames: {
        "#varkLabel": "varkLabel",
        "#varkScores": "varkScores",
        "#varkMultimodal": "varkMultimodal",
        "#updatedAt": "updatedAt",
      },
      ExpressionAttributeValues: {
        ":l": { S: result.label },
        ":s": { S: JSON.stringify(result.scores) },
        ":m": { BOOL: result.multimodal },
        ":at": { S: at },
      },
    }),
  );

  await auditChild(childId, ctx, "assessment_ran", `child:${childId}`, { kind: processor.kind, submission: result.submission });

  return ok({ childId, kind: processor.kind, ...result, createdAt: at }, 201);
};

const listAssessments = async (event, ctx) => {
  const childId = param(event, "id");
  await assertScopeChild(childId, ctx);
  const res = await client.send(
    new CMD.query({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ScanIndexForward: false,
      ExpressionAttributeValues: { ":pk": { S: `ASSESS#${childId}` }, ":sk": { S: "VARK#" } },
    }),
  );
  const data = (res.Items || []).map((i) => ({
    kind: i.kind.S,
    scores: JSON.parse(i.scores.S),
    label: i.label.S,
    multimodal: i.multimodal.BOOL,
    method: i.method.S,
    submission: i.submission?.S || null,
    createdAt: i.createdAt.S,
  }));
  return ok({ data, count: data.length });
};

const listPredictions = async (event, ctx) => {
  const childId = param(event, "id");
  await assertScopeChild(childId, ctx);
  const full = await studentAccess(childId, ctx, "predict_full");
  const res = await client.send(
    new CMD.query({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ScanIndexForward: false,
      ExpressionAttributeValues: { ":pk": { S: `PRED#${childId}` }, ":sk": { S: "PRED#" } },
    }),
  );
  const data = (res.Items || []).map((i) => {
    const base = {
      predictionId: i.SK.S.replace("PRED#", ""),
      model: i.model.S,
      modelVersion: i.modelVersion.S,
      method: i.method.S,
      label: i.label.S,
      createdAt: i.createdAt.S,
    };
    if (full) {
      base.scores = JSON.parse(i.scores.S);
      base.confidence = Number(i.confidence.N);
    }
    return base;
  });
  return ok({ data, count: data.length });
};

export const lambdaHandler = async (event) => {
  try {
    const route = `${event.httpMethod} ${event.resource}`;
    const ctx = await requireAuth(event);
    switch (route) {
      case "POST /children/{id}/assessments":
        return await runAssessment(event, ctx);
      case "GET /children/{id}/assessments":
        return await listAssessments(event, ctx);
      case "GET /children/{id}/predictions":
        return await listPredictions(event, ctx);
      default:
        throw new HttpError(404, "not_found", "Route not found");
    }
  } catch (err) {
    return errorResponse(err);
  }
};
