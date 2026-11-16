import "server-only";
import type { GameError } from "@/lib/game/types";
import { currentUser, type CurrentUser } from "./auth";

const NO_STORE = { "Cache-Control": "private, no-store" };

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

const STATUS: Record<GameError, number> = {
  unauthorized: 401,
  not_found: 404,
  bad_request: 400,
  bad_pin: 400,
  bad_reason: 400,
  no_pin: 409,
  round_closed: 409,
  too_late: 409,
  locked: 409,
  daily_cap: 429,
  server_error: 500,
};

export function fail(error: GameError): Response {
  return json({ error }, STATUS[error]);
}

/**
 * Turns the JSON a game function returned into a response: its `error` field,
 * if it has one, picks the status code.
 */
export function reply(result: unknown): Response {
  if (result && typeof result === "object" && "error" in result) {
    const error = (result as { error: GameError }).error;
    return fail(error in STATUS ? error : "server_error");
  }
  return json(result);
}

/** The signed-in account for an API request, or a 401 response to return as is. */
export async function requireUser(): Promise<CurrentUser | Response> {
  return (await currentUser()) ?? fail("unauthorized");
}

/**
 * Requests that change something must come from our own pages. Session cookies
 * are SameSite=Lax, which already blocks cross-site POSTs; this is a second lock.
 */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") !== "cross-site";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

/** A round number from a URL or request body, or null if it is not one. */
export function roundNumber(value: unknown): number | null {
  const n = typeof value === "string" && /^\d{1,3}$/.test(value) ? Number(value) : value;
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 100 ? n : null;
}

export function coordinate(value: unknown, limit: number): number | null {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= limit ? value : null;
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
