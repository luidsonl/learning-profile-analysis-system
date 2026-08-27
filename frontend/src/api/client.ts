import type { ApiErrorBody } from "./types";

declare global {
  interface Window {
    __ENV__?: { API_BASE?: string };
  }
}

const API_BASE = window.__ENV__?.API_BASE ?? "";

const TOKEN_KEY = "learning-profile.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// Registered by the auth layer; fired on any 401 so the session is cleared
// and the user is redirected to /login.
type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  onUnauthorized = handler;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

interface ApiFetchOptions {
  method?: string;
  token?: string | null;
  body?: unknown;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { method = "GET", token = getToken() as string | null, body } = options;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "network_error", "Não foi possível conectar ao servidor. Verifique sua conexão.");
  }

  if (response.status === 401) {
    onUnauthorized?.();
  }

  if (!response.ok) {
    let code = "unknown_error";
    let message = `Requisição falhou com status ${response.status}`;
    try {
      const data = (await response.json()) as ApiErrorBody;
      if (data?.error?.message) message = data.error.message;
      if (data?.error?.code) code = data.error.code;
    } catch {
      // body was not JSON; keep the generic message
    }
    throw new ApiError(response.status, code, message);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
