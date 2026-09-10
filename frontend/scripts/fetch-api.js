import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const stack = process.env.STACK_NAME || "learning-profile-api";
const region = process.env.REGION || "us-east-1";
const exportName = `${stack}-ApiEndpoint`;

let apiGateway;
try {
  apiGateway = execSync(
    `aws cloudformation list-exports --region ${region} --query "Exports[?Name=='${exportName}'].Value" --output text`,
    { encoding: "utf8" },
  ).trim();
} catch {
  throw new Error(`AWS CLI failed. Check credentials and region ${region}.`);
}

if (!apiGateway) {
  throw new Error(`Export ${exportName} not found. Deploy sam-app first (make backend).`);
}

const base = apiGateway.replace(/\/$/, "");
const proxy = {
  "/api": {
    target: base,
    changeOrigin: true,
    secure: true,
    logLevel: "info",
  },
};

const out = resolve(import.meta.dirname, "../proxy.conf.json");
writeFileSync(out, `${JSON.stringify(proxy, null, 2)}\n`);
console.log(`Proxy written (${out}): /api -> ${base}`);