import { CMD, client, TABLE } from "../lib/db.mjs";
import { ok, errorResponse, parseBody, param, qparam, HttpError } from "../lib/http.mjs";
import { nowIso } from "../lib/ids.mjs";
import { requireKeys, assert } from "../lib/validate.mjs";
import { requireAuth } from "../lib/session.mjs";
import { auditChild, assertScopeChild, getStudentChildId, requireStudentAccess } from "../lib/scope.mjs";
import { getActiveForm, getFormVersion, listFormsByAudience, listAllForms, publishFormDefinition } from "../forms/service.mjs";
import { validateFormDefinition } from "../forms/engine.mjs";
import { AUDIENCES } from "../forms/schema.mjs";
import { getChild } from "./children.mjs";

const listForms = async (event, ctx) => {
  const audience = qparam(event, "audience");
  let forms;
  if (audience) {
    assert(AUDIENCES.includes(audience), "invalid_audience", "audience must be guardian, educator or student");
    forms = await listFormsByAudience(audience);
  } else {
    forms = await listAllForms();
  }
  if (ctx.role === "student") {
    forms = forms.filter((f) => f.audience === "student");
  }
  return ok({ data: forms, count: forms.length });
};

const getForm = async (event, ctx) => {
  const formId = param(event, "formId");
  const form = await getActiveForm(formId);
  if (ctx.role === "student" && form.audience !== "student") {
    throw new HttpError(403, "forbidden", "Students can only access their own forms");
  }
  return ok({ form });
};

const getFormVersionHandler = async (event, ctx) => {
  assert(ctx.role === "admin", "forbidden", "Only admins can view version history", 403);
  const formId = param(event, "formId");
  const version = Number(param(event, "version"));
  const form = await getFormVersion(formId, version);
  return ok({ form });
};

const publishForm = async (event, ctx) => {
  assert(ctx.role === "admin", "forbidden", "Only admins can publish forms", 403);
  const body = parseBody(event);
  requireKeys(body, ["formId", "name", "audience", "sections"]);

  const definition = {
    formId: body.formId,
    name: body.name,
    audience: body.audience,
    description: body.description || "",
    sections: body.sections,
  };

  const errors = validateFormDefinition(definition);
  assert(errors.length === 0, "invalid_form_definition", errors.join("; "));

  const { formId, version } = await publishFormDefinition(definition, { actorId: ctx.userId });
  return ok({ formId, version }, 201);
};

const audienceOkForRole = (ctx, formAudience) => {
  if (ctx.role === "admin") return true;
  if (ctx.role === "student") return formAudience === "student";
  return ctx.role === formAudience;
};

const submitForm = async (event, ctx) => {
  const childId = param(event, "id");
  const formId = param(event, "formId");
  const form = await getActiveForm(formId);

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

  return ok({ submissionId, formId }, 201);
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

export const lambdaHandler = async (event) => {
  try {
    const route = `${event.httpMethod} ${event.resource}`;
    const ctx = await requireAuth(event);
    switch (route) {
      case "GET /forms":
        return await listForms(event, ctx);
      case "GET /forms/{formId}":
        return await getForm(event, ctx);
      case "GET /forms/{formId}/versions/{version}":
        return await getFormVersionHandler(event, ctx);
      case "POST /forms":
        return await publishForm(event, ctx);
      case "POST /children/{id}/forms/{formId}/responses":
        return await submitForm(event, ctx);
      case "GET /children/{id}/forms/{formId}/responses":
        return await getResponses(event, ctx);
      case "GET /children/{id}/submissions":
        return await listSubmissions(event, ctx);
      default:
        throw new HttpError(404, "not_found", "Route not found");
    }
  } catch (err) {
    return errorResponse(err);
  }
};
