const BASE = process.env.API_BASE;

let passed = 0;
let failed = 0;
const failures = [];

export const api = async (method, path, { token, body } = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
};

export const expect = (name, cond, extra = "") => {
  if (cond) {
    passed += 1;
    console.log(`  ok  ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`FAIL  ${name} ${extra}`);
  }
};

export const step = (name) => console.log(`\n== ${name}`);

export const pollUntil = async (fn, { tries = 10, delayMs = 2000 } = {}) => {
  for (let i = 0; i < tries; i++) {
    const result = await fn();
    if (result) return result;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
};

export const summary = () => ({ passed, failed, failures });
