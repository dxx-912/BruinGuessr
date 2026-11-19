/** What the contribution APIs send to the browser. Mirrors the SQL in the Phase 7a migration. */

export type ContributionStatus = "waiting" | "live" | "rejected" | "removed";

/** One of the player's own submissions, in their "Your photos" list. No position: they took it. */
export type MyContribution = {
  id: string;
  status: ContributionStatus;
  receivedAt: number;
  /** Why it was not accepted. */
  reason: string | null;
};

export type Quota = { last24h: number; waiting: number; dailyLimit: number; waitingLimit: number };

/** A waiting submission on the review page (admins only). Times in ms since 1970. */
export type QueueItem = {
  id: string;
  contributor: string | null;
  gpsLat: number;
  gpsLng: number;
  accuracyM: number;
  /** Degrees clockwise from true north, approximate. */
  heading: number | null;
  positionAt: number;
  capturedAt: number;
  receivedAt: number;
  /** The camera frame's actual size. */
  captureWidth: number;
  captureHeight: number;
  /** The stored file's size (at most 2048 px). */
  width: number;
  height: number;
  sharpness: number;
  peopleAnswer: boolean;
  facesDetected: number;
  flagPeople: boolean;
  flagPinCheck: boolean;
};

/** A photo already in the pool near a submission and facing the same way. */
export type NearbyImage = { id: string; lat: number; lng: number; heading: number | null; source: string; distanceM: number };
