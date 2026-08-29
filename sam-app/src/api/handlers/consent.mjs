import { CMD, client, TABLE } from "../lib/db.mjs";
import { ok, errorResponse, parseBody, param, HttpError } from "../lib/http.mjs";
import { nowIso } from "../lib/ids.mjs";
import { requireKeys, assert } from "../lib/validate.mjs";
import { requireAuth } from "../lib/session.mjs";
import { auditStudent, assertScopeStudent } from "../lib/scope.mjs";
import { getStudent } from "./students.mjs";

const LEGAL_BASES = ["guardian", "institution_authorization", "self_consent"];

const canSetConsent = async (studentId, ctx) => {
  // Admin, educator (FOLLOW#) and guardian (GUARD#) with access to the student
  // may set/revoke consent. A minor (role=student) never consents for
  // themselves — self_consent is reserved for adult self-service flows
  // (specs/lgpd.md). assertScopeStudent would also resolve the student's own
  // edge, so the student role is excluded explicitly.
  if (ctx.role === "admin") return true;
  if (ctx.role === "student") return false;
  await assertScopeStudent(studentId, ctx);
  return true;
};

const getConsent = async (event, ctx) => {
  const studentId = param(event, "id");
  await assertScopeStudent(studentId, ctx);
  const student = await getStudent(studentId);
  if (!student) throw new HttpError(404, "student_not_found", "Student not found");

  const res = await client.send(
    new CMD.query({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: { ":pk": { S: `CONSENT#${studentId}` }, ":sk": { S: "CONSENT#" } },
    }),
  );
  const history = (res.Items || []).map((i) => ({
    version: i.version.S,
    status: i.status.S,
    grantedBy: i.grantedBy.S,
    createdAt: i.createdAt.S,
  }));

  return ok({
    current: {
      version: student.consentVersion || null,
      status: student.consentStatus || "not_granted",
      consentAt: student.consentAt || null,
      consentBy: student.consentBy || null,
      legalBasis: student.consentLegalBasis || null,
      grantedByRole: student.consentGrantedByRole || null,
    },
    history,
  });
};

const setConsent = async (event, ctx) => {
  const studentId = param(event, "id");
  if (!(await canSetConsent(studentId, ctx))) throw new HttpError(403, "forbidden", "Only the primary guardian, an educator following the student or an admin can set consent");
  const body = parseBody(event);
  requireKeys(body, ["consentVersion", "status"]);
  assert(["active", "revoked"].includes(body.status), "invalid_status", "status must be active or revoked");
  const legalBasis = body.legalBasis || (ctx.role === "guardian" ? "guardian" : "institution_authorization");
  assert(LEGAL_BASES.includes(legalBasis), "invalid_legal_basis", `legalBasis must be one of ${LEGAL_BASES.join(", ")}`);

  const student = await getStudent(studentId);
  if (!student) throw new HttpError(404, "student_not_found", "Student not found");

  const at = nowIso();

  await client.send(
    new CMD.transact({
      TransactItems: [
        {
          Put: {
            TableName: TABLE,
            Item: {
              PK: { S: `CONSENT#${studentId}` },
              SK: { S: `CONSENT#${body.consentVersion}#${at}` },
              type: { S: "consent" },
              studentId: { S: studentId },
              version: { S: body.consentVersion },
              status: { S: body.status },
              grantedBy: { S: ctx.userId },
              grantedByRole: { S: ctx.role },
              legalBasis: { S: legalBasis },
              createdAt: { S: at },
            },
          },
        },
        {
          Update: {
            TableName: TABLE,
            Key: { PK: { S: `STUDENT#${studentId}` }, SK: { S: "META" } },
            UpdateExpression: "SET #consentStatus = :st, #consentVersion = :v, #consentAt = :at, #consentBy = :by, #consentLegalBasis = :lb, #consentGrantedByRole = :rb, #updatedAt = :at",
            ExpressionAttributeNames: {
              "#consentStatus": "consentStatus",
              "#consentVersion": "consentVersion",
              "#consentAt": "consentAt",
              "#consentBy": "consentBy",
              "#consentLegalBasis": "consentLegalBasis",
              "#consentGrantedByRole": "consentGrantedByRole",
              "#updatedAt": "updatedAt",
            },
            ExpressionAttributeValues: {
              ":st": { S: body.status },
              ":v": { S: body.consentVersion },
              ":at": { S: at },
              ":by": { S: ctx.userId },
              ":lb": { S: legalBasis },
              ":rb": { S: ctx.role },
            },
          },
        },
      ],
    }),
  );

  await auditStudent(studentId, ctx, body.status === "active" ? "consent_granted" : "consent_revoked", `student:${studentId}`, { consentVersion: body.consentVersion, legalBasis });

  return ok({ studentId, consentVersion: body.consentVersion, status: body.status, legalBasis });
};

export const lambdaHandler = async (event) => {
  try {
    const route = `${event.httpMethod} ${event.resource}`;
    const ctx = await requireAuth(event);
    switch (route) {
      case "GET /students/{id}/consent":
        return await getConsent(event, ctx);
      case "POST /students/{id}/consent":
        return await setConsent(event, ctx);
      default:
        throw new HttpError(404, "not_found", "Route not found");
    }
  } catch (err) {
    return errorResponse(err);
  }
};
