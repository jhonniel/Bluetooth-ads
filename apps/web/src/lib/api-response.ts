import "server-only";
import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { AppError, RateLimitError, ValidationError } from "./errors";

const MAX_JSON_BYTES = 64 * 1024;

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ data }, init);
}

export function zodFieldErrors(error: ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return fieldErrors;
}

export function errorResponse(error: unknown, context: string): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "validation_error", message: "The request is invalid.", details: zodFieldErrors(error) } },
      { status: 422 },
    );
  }
  if (error instanceof AppError) {
    const headers: HeadersInit = {};
    if (error instanceof RateLimitError) headers["Retry-After"] = String(error.retryAfterSeconds);
    return NextResponse.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      { status: error.status, headers },
    );
  }
  console.error(`[api] ${context} failed`, error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error);
  return NextResponse.json({ error: { code: "internal_error", message: "An unexpected error occurred." } }, { status: 500 });
}

/** Wraps a route handler with consistent error handling. */
export function handle<Args extends unknown[]>(
  context: string,
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      return errorResponse(error, context);
    }
  };
}

export async function readJson<S extends z.ZodType>(request: Request, schema: S): Promise<z.output<S>> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_JSON_BYTES) throw new ValidationError("Request body is too large.");
  const text = await request.text();
  if (text.length > MAX_JSON_BYTES) throw new ValidationError("Request body is too large.");
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new ValidationError("Request body must be valid JSON.");
  }
  return schema.parse(body);
}

export function readQuery<S extends z.ZodType>(request: Request, schema: S): z.output<S> {
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  return schema.parse(params);
}
