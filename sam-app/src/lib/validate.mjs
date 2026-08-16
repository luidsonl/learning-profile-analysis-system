import { HttpError } from "./http.mjs";

export const assert = (cond, code, message, statusCode = 400) => {
  if (!cond) throw new HttpError(statusCode, code, message);
};

export const requireKeys = (body, keys) => {
  for (const k of keys) {
    assert(body[k] !== undefined && body[k] !== null && body[k] !== "", `validation_failed`, `Missing required field: ${k}`);
  }
};

export const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export const isUuid = (v) => /^[0-9a-fA-F-]{36}$/.test(v);
