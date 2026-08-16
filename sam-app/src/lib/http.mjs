export class HttpError extends Error {
  constructor(statusCode, code, message) {
    super(message || code);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const ok = (data, statusCode = 200) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});

export const noContent = () => ({
  statusCode: 204,
  headers: {},
  body: "",
});

export const errorResponse = (err) => {
  if (err instanceof HttpError) {
    return {
      statusCode: err.statusCode,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: { code: err.code, message: err.message } }),
    };
  }
  console.error(err);
  return {
    statusCode: 500,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ error: { code: "internal_error", message: "Internal error" } }),
  };
};

export const parseBody = (event) => {
  if (!event.body) return {};
  try {
    return JSON.parse(event.body);
  } catch {
    throw new HttpError(400, "invalid_json", "Request body is not valid JSON");
  }
};

export const param = (event, key) => event.pathParameters?.[key];

export const qparam = (event, key) => event.queryStringParameters?.[key];
