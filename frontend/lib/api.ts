import { API_URL } from "./config";
import { getToken } from "./auth";
import type { OnboardingFieldErrors } from "./types";

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly fieldErrors: OnboardingFieldErrors;

  constructor(message: string, status: number, options?: { code?: string; fieldErrors?: OnboardingFieldErrors }) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = options?.code;
    this.fieldErrors = options?.fieldErrors ?? {};
  }
}

export type ApiRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  auth?: boolean;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

type ErrorBody = {
  error?: string;
  message?: string;
  code?: string;
  details?: { formErrors?: string[]; fieldErrors?: OnboardingFieldErrors };
};

export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  if (!API_URL) {
    throw new ApiError(
      "The gateway API URL is not configured. Set NEXT_PUBLIC_API_URL and rebuild the frontend.",
      0
    );
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.auth) {
    const token = getToken();
    if (!token) throw new ApiError("Your session has expired. Please sign in again.", 401);
    headers.Authorization = `Bearer ${token}`;
  }
  if (options.headers) Object.assign(headers, options.headers);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? "GET",
      headers,
      signal: options.signal,
      body: options.body === undefined ? undefined : (typeof options.body === "string" ? options.body : JSON.stringify(options.body))
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError("Cannot reach the gateway API. Check the backend URL and try again.", 0);
  }

  const raw = await response.text();
  let parsed: unknown = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  }

  if (!response.ok) {
    const body = (parsed ?? {}) as ErrorBody;
    const message =
      body.error || body.message || `The request failed with status ${response.status}.`;
    throw new ApiError(message, response.status, {
      code: body.code,
      fieldErrors: body.details?.fieldErrors
    });
  }

  return parsed as T;
}

export function errorMessage(error: unknown, fallback = "Something went wrong."): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
