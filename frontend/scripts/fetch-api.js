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
  throw new Error(`Export ${exportName} not found. Deploy sam-app first (make deploy-api).`);
}

const url = new URL(apiGateway);
const stage = url.pathname.replace(/\/$/, "");

const proxy = {
  "/api": {
    // API Gateway routes live under the stage WITHOUT the CloudFront /api
    // prefix (e.g. /auth/register, not /api/auth/register), so strip /api
    // and prepend the stage.
    target: url.origin,
    changeOrigin: true,
    secure: true,
    logLevel: "info",
    pathRewrite: { "^/api": stage },
  },
};

const out = resolve(import.meta.dirname, "../proxy.conf.json");
writeFileSync(out, `${JSON.stringify(proxy, null, 2)}\n`);
console.log(`Proxy written (${out}): /api -> ${url.origin}${stage}`);