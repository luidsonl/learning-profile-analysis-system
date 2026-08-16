import { CMD, client, TABLE } from "../lib/db.mjs";
import { ok, errorResponse, param, HttpError } from "../lib/http.mjs";
import { nowIso, ts } from "../lib/ids.mjs";
import { requireAuth } from "../lib/session.mjs";
import { auditChild, assertScopeChild, studentAccess } from "../lib/scope.mjs";
import { getAssessmentProcessor } from "../forms/engine.mjs";
import { classifyLatestSubmission } from "../forms/classify.mjs";

const getActiveModelVersion = async (name) => {
  const res = await client.send(
    new CMD.query({
      TableName: TABLE,
      IndexName: "RoleStatus",
      KeyConditionExpression: "GSI2PK = :pk AND begins_with(GSI2SK, :sk)",
      Limit: 1,
      ExpressionAttributeValues: {
        ":pk": { S: `MODEL#STATUS#active` },
        ":sk": { S: `MODEL#${name}#` },
      },
    }),
  );
  return res.Items?.[0];
};

const predict = async (event, ctx) => {
  const childId = param(event, "id");
  await assertScopeChild(childId, ctx);

  const processor = getAssessmentProcessor();
  const formId = processor?.formId || "vark-kids";
  const result = await classifyLatestSubmission(childId, formId);
  if (!result) throw new HttpError(404, "no_submission", "No assessment submission available yet");

  const modelName = process.env.INFERENCE_MODEL || "vark-predictor";
  const model = await getActiveModelVersion(modelName);
  const { scores, label } = result;
  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const confidence = entries.length > 0 && entries[0][1] > 0 ? Math.min(0.99, entries[0][1] / 5) : 0;

  const at = nowIso();
  const predictionId = `${ts()}`;

  await client.send(
    new CMD.put({
      TableName: TABLE,
      Item: {
        PK: { S: `PRED#${childId}` },
        SK: { S: `PRED#${predictionId}` },
        type: { S: "prediction" },
        childId: { S: childId },
        model: { S: modelName },
        modelVersion: { S: model ? model.version.S : "1" },
        method: { S: model?.type?.S === "classifier" ? "ml" : "heuristic" },
        label: { S: label },
        scores: { S: JSON.stringify(scores) },
        confidence: { N: String(confidence) },
        form: { S: formId },
        submission: { S: result.submission },
        createdBy: { S: ctx.userId },
        createdAt: { S: at },
      },
    }),
  );

  await auditChild(childId, ctx, "prediction_created", `child:${childId}`, { model: modelName, label });

  const full = await studentAccess(childId, ctx, "predict_full");
  const prediction = {
    predictionId,
    childId,
    model: modelName,
    modelVersion: model?.version.S || "1",
    method: model?.type?.S === "classifier" ? "ml" : "heuristic",
    label,
    createdAt: at,
  };
  if (full) {
    prediction.scores = scores;
    prediction.confidence = confidence;
  }

  return ok({ prediction }, 201);
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
      case "POST /children/{id}/predict":
        return await predict(event, ctx);
      case "GET /children/{id}/predictions":
        return await listPredictions(event, ctx);
      default:
        throw new HttpError(404, "not_found", "Route not found");
    }
  } catch (err) {
    return errorResponse(err);
  }
};
