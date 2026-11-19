/**
 * The rules for contributed photos (SPEC.md, "Photo contributions"). The
 * browser uses them to guide the player; the server checks every one again.
 */
import { insidePolygons } from "@/lib/geo/inside";
import { CAMPUS_POLYGONS } from "@/lib/map/campus";

/** GPS accuracy (radius, metres) up to this is accepted; worse is refused. FIXED. */
export const MAX_ACCURACY_M = 40;
/** Worse than this, the reviewer must confirm or move the pin. FIXED. */
export const PIN_CHECK_ACCURACY_M = 25;
/** A position fix older than this when the shutter is pressed does not count. */
export const MAX_POSITION_AGE_MS = 10_000;

/** The browser scales the capture to this long edge before upload (served photos are 1600 px). */
export const UPLOAD_LONG_EDGE = 2048;
export const UPLOAD_JPEG_QUALITY = 0.9;
/** Vercel refuses request bodies over 4.5 MB; the file must leave room for the rest of the form. */
export const MAX_UPLOAD_BYTES = 4_000_000;
export const MIN_UPLOAD_BYTES = 10_000;
/** Smallest usable capture: a 1280 × 720 camera still passes. */
export const MIN_LONG_EDGE = 1024;
export const MIN_SHORT_EDGE = 576;
export const MAX_ASPECT = 2.4;

/** Magnetic declination at UCLA (east), from NOAA's model; phone compasses point to magnetic north. */
export const MAGNETIC_DECLINATION_DEG = 11.5;

/** The license every contribution is given under. FIXED. */
export const CONTRIBUTION_LICENSE = "CC BY-SA 4.0";
export const CONTRIBUTION_LICENSE_URL = "https://creativecommons.org/licenses/by-sa/4.0/";

/** True when a position is inside the approved campus boundary (no buffer ring for contributions). */
export const insideCampus = (lat: number, lng: number) => insidePolygons(lng, lat, CAMPUS_POLYGONS);

/** A magnetic compass heading turned into degrees clockwise from true north, 0 ≤ h < 360. */
export function trueHeading(magnetic: number): number {
  const h = Math.round((((magnetic + MAGNETIC_DECLINATION_DEG) % 360) + 360) * 10) / 10;
  // Rounding can land on 360.0, which is north again (the database keeps 0 ≤ h < 360).
  return h % 360;
}

/** The size to scale a capture to so its long edge is at most `maxEdge` (never enlarged). */
export function scaledSize(width: number, height: number, maxEdge = UPLOAD_LONG_EDGE): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** How the live position stands for the shutter. */
export type FixState = "none" | "stale" | "inaccurate" | "outside" | "ok";

export function fixState(fix: { lat: number; lng: number; accuracy: number; at: number } | null, now: number): FixState {
  if (!fix) return "none";
  if (now - fix.at > MAX_POSITION_AGE_MS) return "stale";
  if (!(fix.accuracy <= MAX_ACCURACY_M)) return "inaccurate";
  if (!insideCampus(fix.lat, fix.lng)) return "outside";
  return "ok";
}

/** What the browser sends with the photo. `heading` is the phone's magnetic compass heading. */
export type SubmissionMeta = {
  lat: number;
  lng: number;
  accuracy: number;
  positionAt: number;
  capturedAt: number;
  heading: number | null;
  captureWidth: number;
  captureHeight: number;
  people: boolean;
  faces: number;
  license: true;
};

export type MetaProblem =
  | "bad_request"
  | "license"
  | "people_answer"
  | "too_inaccurate"
  | "outside_campus"
  | "stale_position"
  | "clock";

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const int = (v: unknown, min: number, max: number): v is number => num(v) && Number.isInteger(v) && v >= min && v <= max;

/**
 * Checks the form fields that came with a photo. `now` is the server's clock.
 * The phone's clock sets positionAt and capturedAt, so only their difference is
 * held to the 10 second rule; against the server clock they get a wide margin.
 */
export function checkMeta(raw: unknown, now: number): { meta: SubmissionMeta } | { problem: MetaProblem } {
  if (!raw || typeof raw !== "object") return { problem: "bad_request" };
  const r = raw as Record<string, unknown>;
  if (r.license !== true) return { problem: "license" };
  if (typeof r.people !== "boolean") return { problem: "people_answer" };
  if (!num(r.lat) || !num(r.lng) || Math.abs(r.lat) > 90 || Math.abs(r.lng) > 180) return { problem: "bad_request" };
  if (!num(r.accuracy) || r.accuracy <= 0) return { problem: "bad_request" };
  if (!int(r.positionAt, 0, 1e14) || !int(r.capturedAt, 0, 1e14)) return { problem: "bad_request" };
  if (r.heading !== null && (!num(r.heading) || r.heading < 0 || r.heading > 360)) return { problem: "bad_request" };
  if (!int(r.captureWidth, 1, 20_000) || !int(r.captureHeight, 1, 20_000)) return { problem: "bad_request" };
  if (!int(r.faces, 0, 1000)) return { problem: "bad_request" };

  if (r.accuracy > MAX_ACCURACY_M) return { problem: "too_inaccurate" };
  if (!insideCampus(r.lat, r.lng)) return { problem: "outside_campus" };
  const age = r.capturedAt - r.positionAt;
  if (age > MAX_POSITION_AGE_MS + 1000 || age < -2000) return { problem: "stale_position" };
  // A photo taken more than a day ago, or in the future: the phone's clock is off, or it is not fresh.
  if (r.capturedAt < now - 24 * 3600_000 || r.capturedAt > now + 10 * 60_000) return { problem: "clock" };

  return {
    meta: {
      lat: r.lat,
      lng: r.lng,
      accuracy: Math.round(r.accuracy * 10) / 10,
      positionAt: r.positionAt,
      capturedAt: r.capturedAt,
      heading: r.heading === null ? null : (r.heading as number) % 360,
      captureWidth: r.captureWidth,
      captureHeight: r.captureHeight,
      people: r.people,
      faces: r.faces,
      license: true,
    },
  };
}

/** Ready-made reasons on the review page. The reviewer can also write their own. */
export const REJECT_REASONS = [
  "Blurry or too dark",
  "Too much like a photo we already have",
  "Hard to recognise (a wall, the ground, a close-up)",
  "People in the way",
  "Not where the pin says, or not on campus",
  "Taken indoors",
] as const;
