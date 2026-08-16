import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const outDir = path.join(here, "..");

const funcs = ["HealthFunction", "AuthFunction", "ChildrenFunction", "GuardianshipFunction", "ConsentFunction", "FormsFunction", "ObservationsFunction", "AssessmentFunction", "PredictFunction", "RecommendationsFunction", "ReportsFunction", "ModelsFunction", "AuditFunction"];

let outputs = {};
try {
  outputs = JSON.parse(execSync("terraform output -json", { cwd: path.join(root, "terraform/aws-app"), encoding: "utf8" }));
} catch {
  console.warn("terraform output unavailable; using defaults from env.json.example");
}

const str = (k, fallback = "") => {
  const v = outputs[k]?.value;
  return v !== undefined ? String(v) : fallback;
};

const tableName = str("table_name", "learning-profile");
const filesBucket = str("files_bucket_name", "learning-profile-files");
const queueUrl = str("report_queue_url", "");

// host.docker.internal resolves to the Docker host from inside the SAM local
// runtime container (Linux/Mac); required to reach DynamoDB Local.
const base = {
  TABLE_NAME: tableName,
  DYNAMODB_ENDPOINT: process.env.DYNAMODB_ENDPOINT || "http://host.docker.internal:8000",
};

const env = {
  HealthFunction: { TABLE_NAME: tableName },
  ReportsFunction: { ...base, FILES_BUCKET: filesBucket, REPORT_QUEUE_URL: queueUrl },
};

for (const f of funcs.filter((f) => !env[f])) env[f] = { ...base };

fs.writeFileSync(path.join(outDir, "env.json"), JSON.stringify(env, null, 2) + "\n");
console.log(`env.json written (${queueUrl ? "queue URL included" : "no queue URL"})`);
