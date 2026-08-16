import { unmarshall } from "@aws-sdk/util-dynamodb";
import { CMD, client, TABLE } from "../lib/db.mjs";
import { HttpError } from "../lib/http.mjs";
import { nowIso } from "../lib/ids.mjs";

const key = (pk, sk) => ({ PK: { S: pk }, SK: { S: sk } });

export const getCurrentVersion = async (formId) => {
  const res = await client.send(new CMD.get({ TableName: TABLE, Key: key(`FORM#${formId}`, "CURRENT") }));
  return res.Item?.version ? Number(res.Item.version.S) : null;
};

export const getFormVersion = async (formId, version) => {
  const res = await client.send(new CMD.get({ TableName: TABLE, Key: key(`FORM#${formId}`, `VERSION#${version}`) }));
  if (!res.Item) throw new HttpError(404, "form_not_found", `Form ${formId} version ${version} not found`);
  const raw = unmarshall(res.Item);
  const definition = typeof raw.definition === "string" ? JSON.parse(raw.definition) : raw.definition;
  return {
    ...definition,
    formId,
    version: Number(raw.version),
    status: raw.status,
    createdAt: raw.createdAt,
    createdBy: raw.createdBy || "",
  };
};

export const getActiveForm = async (formId) => {
  const version = await getCurrentVersion(formId);
  if (!version) throw new HttpError(404, "form_not_found", `Form ${formId} has no active version`);
  return getFormVersion(formId, version);
};

export const listFormsByAudience = async (audience) => {
  const res = await client.send(
    new CMD.query({
      TableName: TABLE,
      IndexName: "RoleStatus",
      KeyConditionExpression: "GSI2PK = :pk",
      ExpressionAttributeValues: { ":pk": { S: `FORM#AUD#${audience}` } },
    }),
  );
  const forms = [];
  for (const item of res.Items || []) {
    const parts = item.GSI2SK.S.split("#");
    if (parts.at(-1) !== "active") continue;
    const formId = parts[1];
    const definition = await getFormVersion(formId, Number(item.version.S));
    forms.push(definition);
  }
  return forms;
};

export const listAllForms = async () => {
  const res = await client.send(new CMD.get({ TableName: TABLE, Key: key("FORM#CATALOG", "CATALOG") }));
  const formIds = res.Item?.formIds?.SS || [];
  const forms = [];
  for (const formId of formIds) {
    const version = await getCurrentVersion(formId);
    if (version) forms.push(await getFormVersion(formId, version));
  }
  return forms;
};

export const publishFormDefinition = async (definition, { actorId, at = nowIso() } = {}) => {
  const { formId, name, audience } = definition;
  const current = await getCurrentVersion(formId);
  const version = (current || 0) + 1;
  const gsi2sk = `FORM#${formId}#v${version}#active`;

  const versionItem = {
    PK: { S: `FORM#${formId}` },
    SK: { S: `VERSION#${version}` },
    version: { S: String(version) },
    name: { S: name },
    audience: { S: audience },
    definition: { S: JSON.stringify(definition) },
    status: { S: "active" },
    createdBy: { S: actorId || "" },
    createdAt: { S: at },
    GSI2PK: { S: `FORM#AUD#${audience}` },
    GSI2SK: { S: gsi2sk },
  };

  const transact = {
    TransactItems: [
      { Put: { TableName: TABLE, Item: versionItem, ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)" } },
      { Put: { TableName: TABLE, Item: { PK: { S: `FORM#${formId}` }, SK: { S: "CURRENT" }, version: { S: String(version) }, updatedAt: { S: at } } } },
      {
        Update: {
          TableName: TABLE,
          Key: key("FORM#CATALOG", "CATALOG"),
          UpdateExpression: "ADD #formIds :f",
          ExpressionAttributeNames: { "#formIds": "formIds" },
          ExpressionAttributeValues: { ":f": { SS: [formId] } },
        },
      },
    ],
  };

  if (current) {
    transact.TransactItems.unshift({
      Update: {
        TableName: TABLE,
        Key: key(`FORM#${formId}`, `VERSION#${current}`),
        UpdateExpression: "SET #status = :archived",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":archived": { S: "archived" } },
      },
    });
  }

  await client.send(new CMD.transact(transact));
  return { formId, version };
};
