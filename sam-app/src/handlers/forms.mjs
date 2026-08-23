import { CMD, client, TABLE } from "../lib/db.mjs";
import { ok, errorResponse, parseBody, param, qparam, HttpError } from "../lib/http.mjs";
import { nowIso } from "../lib/ids.mjs";
import { assert, requireKeys } from "../lib/validate.mjs";
import { requireAuth } from "../lib/session.mjs";
import { auditChild, assertScopeChild, getStudentChildId, requireStudentAccess, studentAccess } from "../lib/scope.mjs";
import { getDefinitions, getFormDefinition, getAssessmentProcessor } from "../forms/engine.mjs";
import { classifyLatestSubmission } from "../forms/classify.mjs";
import { AUDIENCES } from "../forms/schema.mjs";
import { getChild } from "./children.mjs";

const listForms = async (event, ctx) => {
  const audience = qparam(event, "audience");
  let forms = getDefinitions();
  if (audience) {
    assert(AUDIENCES.includes(audience), "invalid_audience", "audience must be guardian, educator or student");
    forms = forms.filter((f) => f.audience === audience);
  }
  if (ctx.role === "student") {
    forms = forms.filter((f) => f.audience === "student");
  }
  return ok({ data: forms, count: forms.length });
};

const getForm = async (event, ctx) => {
  const formId = param(event, "formId");
  const form = getFormDefinition(formId);
  if (!form) throw new HttpError(404, "form_not_found", "Form not found");
  if (ctx.role === "student" && form.audience !== "student") {
    throw new HttpError(403, "forbidden", "Students can only access their own forms");
  }
  return ok({ form });
};

const audienceOkForRole = (ctx, formAudience) => {
  if (ctx.role === "admin") return true;
  if (ctx.role === "student") return formAudience === "student";
  if (ctx.role === "guardian") return formAudience === "guardian" || formAudience === "student";
  return ctx.role === formAudience;
};

const submitForm = async (event, ctx) => {
  const childId = param(event, "id");
  const formId = param(event, "formId");
  const form = getFormDefinition(formId);
  if (!form) throw new HttpError(404, "form_not_found", "Form not found");

  assert(audienceOkForRole(ctx, form.audience), "forbidden", `Form ${formId} is not available to role ${ctx.role}`, 403);

  if (ctx.role === "student") {
    const ownChild = await getStudentChildId(ctx.userId);
    assert(ownChild === childId, "forbidden", "Students can only submit forms for their own profile", 403);
  } else {
    await assertScopeChild(childId, ctx);
  }

  const child = await getChild(childId);
  if (!child) throw new HttpError(404, "child_not_found", "Child not found");
  assert(child.consentStatus === "active", "consent_required", "Active consent is required to submit forms", 409);

  const body = parseBody(event);
  requireKeys(body, ["answers"]);
  assert(body.answers && typeof body.answers === "object", "validation_failed", "answers must be an object");

  const at = nowIso();
  const key = body.requestId ? `SUBMISSION#${formId}#${body.requestId}` : `SUBMISSION#${formId}#${at}`;
  if (body.requestId) {
    const existing = await client.send(
      new CMD.get({ TableName: TABLE, Key: { PK: { S: `CHILD#${childId}` }, SK: { S: key } } }),
    );
    if (existing.Item) return ok({ submissionId: existing.Item.submissionId?.S || key, submittedBy: "already_exists" });
  }

  const submissionId = key.replace(/^SUBMISSION#/, "");
  const submissionItem = {
    PK: { S: `CHILD#${childId}` },
    SK: { S: key },
    type: { S: "submission" },
    formId: { S: formId },
    formVersion: { S: String(form.version) },
    submissionId: { S: submissionId },
    answers: { S: JSON.stringify(body.answers) },
    submittedBy: { S: ctx.userId },
    submittedByRole: { S: ctx.role },
    createdAt: { S: at },
  };

  await client.send(new CMD.put({ TableName: TABLE, Item: submissionItem, ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)" }));
  await auditChild(childId, ctx, "form_submitted", `form:${formId}`, { formVersion: form.version });

  await triggerInference({ childId, formId, formVersion: String(form.version), submissionId, answers: body.answers });

  return ok({ submissionId, formId }, 201);
};

const INFERENCE_FORMS = (process.env.INFERENCE_FORMS || "vark").split(",").map((s) => s.trim()).filter(Boolean);

const triggerInference = async (payload) => {
  if (!INFERENCE_FORMS.includes(payload.formId)) return;
  try {
    const { LambdaClient, InvokeCommand } = await import("@aws-sdk/client-lambda");
    const lambdaClient = new LambdaClient();
    await lambdaClient.send(
      new InvokeCommand({
        FunctionName: process.env.INFERENCE_FUNCTION_NAME,
        InvocationType: "Event",
        Payload: JSON.stringify(payload),
      }),
    );
  } catch (err) {
    console.error("inference_invoke_failed", JSON.stringify({ formId: payload.formId, error: err.message }));
  }
};

const listSubmissions = async (event, ctx) => {
  const childId = param(event, "id");
  await assertScopeChild(childId, ctx);
  await requireStudentAccess(childId, ctx, "submissions_list");
  const res = await client.send(
    new CMD.query({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ScanIndexForward: false,
      ExpressionAttributeValues: { ":pk": { S: `CHILD#${childId}` }, ":sk": { S: "SUBMISSION#" } },
    }),
  );
  const data = (res.Items || []).map((i) => ({
    submissionId: i.submissionId.S,
    formId: i.formId.S,
    formVersion: Number(i.formVersion.S),
    answers: JSON.parse(i.answers.S),
    submittedBy: i.submittedBy.S,
    submittedByRole: i.submittedByRole.S,
    createdAt: i.createdAt.S,
  }));
  return ok({ data, count: data.length });
};

const shapePrediction = (i, full) => {
  const p = {
    predictionId: i.SK.S.replace("PRED#", ""),
    model: i.model.S,
    modelVersion: i.modelVersion.S,
    method: i.method.S,
    label: i.label.S,
    createdAt: i.createdAt.S,
  };
  if (full) {
    p.scores = JSON.parse(i.scores.S);
    p.confidence = Number(i.confidence.N);
  }
  return p;
};

const latestPredictionsBySubmission = async (childId, full) => {
  const res = await client.send(
    new CMD.query({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: { ":pk": { S: `PRED#${childId}` }, ":sk": { S: "PRED#" } },
    }),
  );
  const bySubmission = new Map();
  for (const item of res.Items || []) {
    const sub = item.submission?.S;
    if (!sub) continue;
    bySubmission.set(sub, shapePrediction(item, full));
  }
  return bySubmission;
};

const getResponses = async (event, ctx) => {
  const childId = param(event, "id");
  const formId = param(event, "formId");
  await assertScopeChild(childId, ctx);
  await requireStudentAccess(childId, ctx, "submissions_list");

  const res = await client.send(
    new CMD.query({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: { ":pk": { S: `CHILD#${childId}` }, ":sk": { S: `SUBMISSION#${formId}#` } },
    }),
  );
  const full = await studentAccess(childId, ctx, "predict_full");
  const predictions = await latestPredictionsBySubmission(childId, full);
  const data = (res.Items || []).map((i) => ({
    submissionId: i.submissionId.S,
    formId: i.formId.S,
    formVersion: Number(i.formVersion.S),
    answers: JSON.parse(i.answers.S),
    submittedBy: i.submittedBy.S,
    submittedByRole: i.submittedByRole.S,
    createdAt: i.createdAt.S,
    prediction: predictions.get(i.submissionId.S) || null,
  }));
  return ok({ data, count: data.length });
};

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
  const data = (res.Items || []).map((i) => shapePrediction(i, full));
  return ok({ data, count: data.length });
};

export const lambdaHandler = async (event) => {
  try {
    const route = `${event.httpMethod} ${event.resource}`;
    const ctx = await requireAuth(event);
    switch (route) {
      case "GET /forms":
        return await listForms(event, ctx);
      case "GET /forms/{formId}":
        return await getForm(event, ctx);
      case "POST /children/{id}/forms/{formId}/responses":
        return await submitForm(event, ctx);
      case "GET /children/{id}/forms/{formId}/responses":
        return await getResponses(event, ctx);
      case "GET /children/{id}/submissions":
        return await listSubmissions(event, ctx);
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
