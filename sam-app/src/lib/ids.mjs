import { randomUUID } from "node:crypto";

export const uid = () => randomUUID();

export const nowIso = () => new Date().toISOString();

export const ts = () => Date.now();

export const ttlSeconds = (seconds) => Math.floor(Date.now() / 1000) + seconds;
