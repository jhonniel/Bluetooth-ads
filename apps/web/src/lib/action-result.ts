import "server-only";
import { ZodError } from "zod";
import { AppError } from "./errors";
import { zodFieldErrors } from "./api-response";
import type { ActionResult } from "./action-types";

/** Runs a server action body and converts expected failures into a serializable result. */
export async function runAction<T>(context: string, fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (error) {
    if (error instanceof ZodError) {
      return { ok: false, error: "Please correct the highlighted fields.", fieldErrors: zodFieldErrors(error) };
    }
    if (error instanceof AppError) {
      return {
        ok: false,
        error: error.message,
        fieldErrors: error.details && typeof error.details === "object" ? (error.details as Record<string, string[]>) : undefined,
      };
    }
    // Next.js redirects/notFound are thrown as errors and must propagate.
    if (error instanceof Error && "digest" in error && typeof error.digest === "string" && error.digest.startsWith("NEXT_")) {
      throw error;
    }
    console.error(`[action] ${context} failed`, error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
