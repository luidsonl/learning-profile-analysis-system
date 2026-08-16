import { CMD, client, TABLE } from "../lib/db.mjs";
import { ok, errorResponse, parseBody, param, HttpError } from "../lib/http.mjs";
import { nowIso } from "../lib/ids.mjs";
import { requireKeys, assert } from "../lib/validate.mjs";
import { requireAuth } from "../lib/session.mjs";
import { auditChild, assertScopeChild } from "../lib/scope.mjs";
import { getChild } from "./children.mjs";

const LEGAL_BASES = ["guardian", "institution_authorization", "self_consent"];

const isPrimaryGuardian = async (childId, ctx) => {
  if (ctx.role === "admin") return true;
  if (ctx.role !== "guardian") return false;
  const child = await getChild(childId);
  return child?.createdBy === ctx.userId;
};

const canSetConsent = async (childId, ctx) => {
  if (ctx.role === "admin") return true;
  if (ctx.role === "educator") {
    await assertScopeChild(childId, ctx);
    return true;
  }
  if (ctx.role === "guardian") return (await getChild(childId))?.createdBy === ctx.userId;
  return false;
};

const getConsent = async (event, ctx) => {
  const childId = param(event, "id");
  await assertScopeChild(childId, ctx);
  const child = await getChild(childId);
  if (!child) throw new HttpError(404, "child_not_found", "Child not found");

  const res = await client.send(
    new CMD.query({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: { ":pk": { S: `CONSENT#${childId}` }, ":sk": { S: "CONSENT#" } },
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
      version: child.consentVersion || null,
      status: child.consentStatus || "not_granted",
      consentAt: child.consentAt || null,
      consentBy: child.consentBy || null,
      legalBasis: child.consentLegalBasis || null,
      grantedByRole: child.consentGrantedByRole || null,
    },
    history,
  });
};

const setConsent = async (event, ctx) => {
  const childId = param(event, "id");
  if (!(await canSetConsent(childId, ctx))) throw new HttpError(403, "forbidden", "Only the primary guardian, an educator following the child or an admin can set consent");
  const body = parseBody(event);
  requireKeys(body, ["consentVersion", "status"]);
  assert(["active", "revoked"].includes(body.status), "invalid_status", "status must be active or revoked");
  const legalBasis = body.legalBasis || (ctx.role === "guardian" ? "guardian" : "institution_authorization");
  assert(LEGAL_BASES.includes(legalBasis), "invalid_legal_basis", `legalBasis must be one of ${LEGAL_BASES.join(", ")}`);

  const child = await getChild(childId);
  if (!child) throw new HttpError(404, "child_not_found", "Child not found");

  const at = nowIso();

  await client.send(
    new CMD.transact({
      TransactItems: [
        {
          Put: {
            TableName: TABLE,
            Item: {
              PK: { S: `CONSENT#${childId}` },
              SK: { S: `CONSENT#${body.consentVersion}#${at}` },
              type: { S: "consent" },
              childId: { S: childId },
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
            Key: { PK: { S: `CHILD#${childId}` }, SK: { S: "META" } },
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

  await auditChild(childId, ctx, body.status === "active" ? "consent_granted" : "consent_revoked", `child:${childId}`, { consentVersion: body.consentVersion, legalBasis });

  return ok({ childId, consentVersion: body.consentVersion, status: body.status, legalBasis });
};

export const lambdaHandler = async (event) => {
  try {
    const route = `${event.httpMethod} ${event.resource}`;
    const ctx = await requireAuth(event);
    switch (route) {
      case "GET /children/{id}/consent":
        return await getConsent(event, ctx);
      case "POST /children/{id}/consent":
        return await setConsent(event, ctx);
      default:
        throw new HttpError(404, "not_found", "Route not found");
    }
  } catch (err) {
    return errorResponse(err);
  }
};
