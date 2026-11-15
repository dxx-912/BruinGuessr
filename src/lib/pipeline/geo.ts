import { readFileSync } from "node:fs";
import path from "node:path";
import { booleanPointInPolygon, buffer } from "@turf/turf";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import type { BoundaryProps } from "../geo/boundary";
import { haversineMeters } from "../geo/distance";
import { PIPELINE } from "./config";
import type { Zone } from "./types";

type Shape = Feature<Polygon | MultiPolygon>;

export type CampusShapes = {
  campus: Feature<Polygon | MultiPolygon, BoundaryProps>;
  /** Campus grown by the eligibility buffer. */
  ring: Shape;
};

let cached: CampusShapes | undefined;

/** The approved boundary and its buffer ring. Reads data/campus.geojson once. */
export function campusShapes(root = process.cwd()): CampusShapes {
  if (cached) return cached;
  const campus = JSON.parse(readFileSync(path.join(root, "data/campus.geojson"), "utf8")) as CampusShapes["campus"];
  const ring = buffer(campus, PIPELINE.bufferM, { units: "meters" }) as Shape | undefined;
  if (!ring) throw new Error("could not buffer the campus boundary");
  cached = { campus, ring };
  return cached;
}

export function zoneOf(lng: number, lat: number, shapes: CampusShapes = campusShapes()): Zone {
  if (booleanPointInPolygon([lng, lat], shapes.campus)) return "inside";
  if (booleanPointInPolygon([lng, lat], shapes.ring)) return "buffer";
  return "outside";
}

/** The point `meters` away from a start point along a compass heading (degrees clockwise from north). */
export function stepAlongHeading(lng: number, lat: number, headingDeg: number, meters: number): [number, number] {
  const rad = (headingDeg * Math.PI) / 180;
  const dLat = (meters * Math.cos(rad)) / 111_320;
  const dLng = (meters * Math.sin(rad)) / (111_320 * Math.cos((lat * Math.PI) / 180));
  return [lng + dLng, lat + dLat];
}

/**
 * True when a camera standing outside campus has campus in frame: somewhere within
 * `lookAheadM`, along its heading or up to `halfFovDeg` to either side, the line of
 * sight is over campus ground.
 */
export function facesCampus(
  lng: number,
  lat: number,
  headingDeg: number,
  lookAheadM: number = PIPELINE.mapillary.bufferLookAheadM,
  halfFovDeg: number = PIPELINE.mapillary.bufferHalfFovDeg,
  shapes: CampusShapes = campusShapes(),
): boolean {
  const offsets = halfFovDeg > 0 ? [0, -halfFovDeg / 2, halfFovDeg / 2, -halfFovDeg, halfFovDeg] : [0];
  for (const offset of offsets) {
    for (let d = 5; d <= lookAheadM; d += 5) {
      if (booleanPointInPolygon(stepAlongHeading(lng, lat, headingDeg + offset, d), shapes.campus)) return true;
    }
  }
  return false;
}

/** Smallest angle between two compass headings, 0..180. */
export function headingDiff(a: number, b: number): number {
  const d = Math.abs((((a - b) % 360) + 360) % 360);
  return d > 180 ? 360 - d : d;
}

export type Thinnable = { lat: number; lng: number; heading: number | null; score: number };

/**
 * Thins near duplicates. Walks the photos from best score to worst and keeps one
 * only if no already-kept photo is within `radiusM` facing within `headingDeg`.
 * A photo with no heading is treated as a duplicate of anything that close.
 */
export function thinNearDuplicates<T extends Thinnable>(items: T[], radiusM: number, headingDeg: number): T[] {
  const kept: T[] = [];
  const sorted = [...items].sort((a, b) => b.score - a.score);
  for (const item of sorted) {
    const clash = kept.some((k) => {
      if (haversineMeters(k, item) > radiusM) return false;
      if (k.heading === null || item.heading === null) return true;
      return headingDiff(k.heading, item.heading) < headingDeg;
    });
    if (!clash) kept.push(item);
  }
  return kept;
}
