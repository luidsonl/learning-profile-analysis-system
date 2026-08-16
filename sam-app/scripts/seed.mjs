import { client, TABLE } from "../src/lib/db.mjs";
import { getDefinitions } from "../src/forms/engine.mjs";
import { getCurrentVersion, publishFormDefinition } from "../src/forms/service.mjs";
import { CMD } from "../src/lib/db.mjs";

const MODEL_DEFINITIONS = [
  {
    name: "vark-predictor",
    type: "classifier",
    description: "Classificação de preferência de aprendizado VARK a partir de 15 itens Likert.",
    status: "active",
    version: "1",
    artifact: "s3://learning-profile-data/models/vark-predictor/1/model.joblib",
    metric: { accuracy: 0.0 },
  },
  {
    name: "giftedness-indicator",
    type: "heuristic",
    description: "Indicador heurístico de características de altas habilidades (consentido).",
    status: "active",
    version: "1",
    artifact: "none",
    metric: {},
  },
  {
    name: "difficulty-indicator",
    type: "heuristic",
    description: "Indicador heurístico de indícios de dificuldades de aprendizagem (consentido).",
    status: "active",
    version: "1",
    artifact: "none",
    metric: {},
  },
];

async function seedForms() {
  for (const def of getDefinitions()) {
    const current = await getCurrentVersion(def.formId);
    if (current) {
      console.log(`form ${def.formId} already present (v${current}) — skipping`);
      continue;
    }
    const { formId, version } = await publishFormDefinition(def);
    console.log(`form ${formId} v${version} seeded`);
  }
}

async function seedModels() {
  for (const def of MODEL_DEFINITIONS) {
    const { name, version, ...rest } = def;
    const existing = await client.send(
      new CMD.get({ TableName: TABLE, Key: { PK: { S: `MODEL#${name}` }, SK: { S: `VERSION#${version}` } } }),
    );
    if (existing.Item) {
      console.log(`model ${name} v${version} already present — skipping`);
      continue;
    }
    const item = {
      PK: { S: `MODEL#${name}` },
      SK: { S: `VERSION#${version}` },
      name: { S: name },
      version: { S: version },
      GSI2PK: { S: `MODEL#STATUS#${rest.status}` },
      GSI2SK: { S: `MODEL#${name}#v${version}` },
      ...Object.fromEntries(
        Object.entries(rest).map(([k, v]) => [k, typeof v === "object" ? { S: JSON.stringify(v) } : { S: String(v) }]),
      ),
    };
    await client.send(new CMD.put({ TableName: TABLE, Item: item }));
    console.log(`model ${name} v${version} seeded`);
  }
}

await seedForms();
await seedModels();
console.log("seed done (AWS bootstrap, idempotent)");
