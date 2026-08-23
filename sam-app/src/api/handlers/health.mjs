import { ok } from "../lib/http.mjs";

export const lambdaHandler = async () => ok({ status: "ok", service: "learning-profile-api", time: new Date().toISOString() });
