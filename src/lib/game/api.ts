import type { GameError, GameState, LatLng, ReportReason } from "./types";

/** A request to the game API that did not succeed. `code` says why. */
export class ApiError extends Error {
  constructor(
    public readonly code: GameError | "network",
    public readonly status: number,
  ) {
    super(code);
  }
}

/**
 * Tracks the difference between this device's clock and the server's, so the
 * countdown on screen matches the deadline the server enforces even when the
 * device's clock is wrong.
 */
class ServerClock {
  private offset = 0;
  private bestRoundTrip = Infinity;

  /** `serverNow` came back from a request sent at `sentAt` and received at `receivedAt` (device time). */
  sync(serverNow: number, sentAt: number, receivedAt: number) {
    const roundTrip = receivedAt - sentAt;
    // The quickest request gives the tightest estimate. Slower ones are ignored.
    if (roundTrip <= this.bestRoundTrip) {
      this.bestRoundTrip = roundTrip;
      this.offset = serverNow - (sentAt + roundTrip / 2);
    }
  }

  /** The server's current time, in ms since 1970. */
  now(): number {
    return Date.now() + this.offset;
  }
}

export const serverClock = new ServerClock();

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const sentAt = Date.now();
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      cache: "no-store",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("network", 0);
  }
  const data = (await response.json().catch(() => null)) as (T & { error?: GameError; serverNow?: number }) | null;
  if (!response.ok || !data || data.error) {
    throw new ApiError(data?.error ?? "server_error", response.status);
  }
  if (typeof data.serverNow === "number") serverClock.sync(data.serverNow, sentAt, Date.now());
  return data;
}

export const api = {
  newGame: () => request<{ id: string }>("POST", "/api/games"),
  state: (gameId: string) => request<GameState>("GET", `/api/games/${gameId}`),
  startRound: (gameId: string) => request<GameState>("POST", `/api/games/${gameId}/round`),
  pin: (gameId: string, round: number, pin: LatLng) =>
    request<{ ok: true }>("PUT", `/api/games/${gameId}/pin`, { round, ...pin }),
  guess: (gameId: string, round: number, pin: LatLng | null) =>
    request<GameState>("POST", `/api/games/${gameId}/guess`, { round, ...(pin ?? {}) }),
  report: (gameId: string, round: number, reason: ReportReason) =>
    request<{ ok: true }>("POST", `/api/games/${gameId}/rounds/${round}/report`, { reason }),

  /**
   * Downloads the round's photo into memory. The address only works while the
   * round is open, so the reveal and summary screens reuse this copy.
   */
  async photo(gameId: string, round: number): Promise<Blob> {
    let response: Response;
    try {
      response = await fetch(`/api/games/${gameId}/rounds/${round}/photo`, { cache: "no-store" });
    } catch {
      throw new ApiError("network", 0);
    }
    if (!response.ok) throw new ApiError(response.status === 404 ? "round_closed" : "server_error", response.status);
    return response.blob();
  },
};
