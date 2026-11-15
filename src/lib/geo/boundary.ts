import { bbox as turfBbox, difference, featureCollection, multiPolygon } from "@turf/turf";
import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from "geojson";
import { bboxDiagonalMeters, type Bbox } from "./distance";

/**
 * One candidate piece of the campus, as written to data/campus-areas.geojson.
 *
 * - `main` is the big OSM outline (main campus and the Hill). It is always in.
 * - `inner` areas sit inside `main`. Leaving one out cuts a hole in the boundary.
 * - `detached` areas are separate polygons. Including one adds it to the boundary.
 */
export type AreaProps = {
  id: string;
  name: string;
  kind: "main" | "inner" | "detached";
  /** What I recommend for the final boundary. `main` is always "include". */
  recommend: "include" | "exclude";
  /** One or two sentences on what is there and why I recommend what I do. */
  note: string;
  area_ha: number;
};

export type AreaFeature = Feature<Polygon | MultiPolygon, AreaProps>;
export type AreaCollection = FeatureCollection<Polygon | MultiPolygon, AreaProps>;

export type BoundaryProps = {
  name: string;
  /** Ids of the optional areas that are part of this boundary. */
  included: string[];
  /** Ids of the optional areas that were left out. */
  excluded: string[];
  bbox: Bbox;
  /** Scoring constant D: diagonal of `bbox` in meters. */
  diagonal_m: number;
  approved: boolean;
  source: string;
  attribution: string;
};

const polygonsOf = (f: Feature<Polygon | MultiPolygon>): Position[][][] =>
  f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;

/**
 * Build the campus boundary from the candidate areas and a list of included
 * optional areas. Used by the build script (to write data/campus.geojson) and
 * by the review page (to preview a choice live), so both always agree.
 */
export function composeBoundary(
  areas: AreaCollection,
  include: readonly string[],
): Feature<Polygon | MultiPolygon> {
  const main = areas.features.find((f) => f.properties.kind === "main");
  if (!main) throw new Error("campus-areas.geojson has no feature with kind 'main'");

  let shape: Feature<Polygon | MultiPolygon> = main;
  for (const area of areas.features) {
    if (area.properties.kind !== "inner" || include.includes(area.properties.id)) continue;
    const cut = difference(featureCollection<Polygon | MultiPolygon>([shape, area]));
    if (!cut) throw new Error(`Removing '${area.properties.id}' left nothing of the campus`);
    shape = cut;
  }

  const rings = polygonsOf(shape);
  for (const area of areas.features) {
    if (area.properties.kind === "detached" && include.includes(area.properties.id)) {
      rings.push(...polygonsOf(area));
    }
  }
  return multiPolygon(rings);
}

/** Bounding box and scoring constant D for a boundary. */
export function boundaryMetrics(boundary: Feature<Polygon | MultiPolygon>): {
  bbox: Bbox;
  diagonalM: number;
} {
  const [west, south, east, north] = turfBbox(boundary);
  const bbox: Bbox = [west, south, east, north];
  return { bbox, diagonalM: bboxDiagonalMeters(bbox) };
}
