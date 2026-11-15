import { readFileSync } from "node:fs";
import path from "node:path";
import { area as turfArea, booleanPointInPolygon } from "@turf/turf";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import { describe, expect, it } from "vitest";
import {
  boundaryMetrics,
  composeBoundary,
  type AreaCollection,
  type BoundaryProps,
} from "../src/lib/geo/boundary";

const read = (file: string) => JSON.parse(readFileSync(path.join(__dirname, "../data", file), "utf8"));
const areas: AreaCollection = read("campus-areas.geojson");
const campus: Feature<Polygon | MultiPolygon, BoundaryProps> = read("campus.geojson");
const selection: { approved: boolean; include: string[] } = read("campus-selection.json");

const optionalIds = areas.features.filter((f) => f.properties.kind !== "main").map((f) => f.properties.id);
const innerIds = areas.features.filter((f) => f.properties.kind === "inner").map((f) => f.properties.id);
const ha = (f: Feature<Polygon | MultiPolygon>) => turfArea(f) / 10_000;

// Well-known spots, [lng, lat].
const ROYCE_HALL: [number, number] = [-118.44215, 34.07292];
const BRUIN_PLAZA: [number, number] = [-118.44505, 34.07095];
const DE_NEVE_PLAZA: [number, number] = [-118.45025, 34.07045];
const REAGAN_MEDICAL_CENTER: [number, number] = [-118.44634, 34.06646];
const DRAKE_STADIUM: [number, number] = [-118.44853, 34.07197];
const SUNSET_CANYON_REC: [number, number] = [-118.45219, 34.07475];
const BOTANICAL_GARDEN: [number, number] = [-118.44103, 34.06548];
const WEYBURN_TERRACE: [number, number] = [-118.4497, 34.0612];
const WILSHIRE_CENTER: [number, number] = [-118.4445, 34.058];
const WESTWOOD_AND_WILSHIRE: [number, number] = [-118.4432, 34.0595];
const BEL_AIR: [number, number] = [-118.445, 34.082];

describe("campus-areas.geojson", () => {
  it("has exactly one main area and the flagged areas the spec names", () => {
    expect(areas.features.filter((f) => f.properties.kind === "main")).toHaveLength(1);
    expect(optionalIds.sort()).toEqual(
      ["drake-stadium", "medical", "southwest", "sunset-canyon-rec", "westwood-village"].sort(),
    );
  });

  it("gives every area a name, a note and a recommendation", () => {
    for (const f of areas.features) {
      expect(f.properties.name.length).toBeGreaterThan(3);
      expect(f.properties.note.length).toBeGreaterThan(20);
      expect(["include", "exclude"]).toContain(f.properties.recommend);
      expect(f.properties.area_ha).toBeGreaterThan(0);
    }
  });

  it("puts each landmark in the area named after it", () => {
    const byId = Object.fromEntries(areas.features.map((f) => [f.properties.id, f]));
    expect(booleanPointInPolygon(REAGAN_MEDICAL_CENTER, byId["medical"])).toBe(true);
    expect(booleanPointInPolygon(DRAKE_STADIUM, byId["drake-stadium"])).toBe(true);
    expect(booleanPointInPolygon(SUNSET_CANYON_REC, byId["sunset-canyon-rec"])).toBe(true);
    expect(booleanPointInPolygon(WEYBURN_TERRACE, byId["southwest"])).toBe(true);
    expect(booleanPointInPolygon(WILSHIRE_CENTER, byId["westwood-village"])).toBe(true);
    // The botanical garden is core campus, not part of the medical area.
    expect(booleanPointInPolygon(BOTANICAL_GARDEN, byId["medical"])).toBe(false);
    expect(booleanPointInPolygon(BOTANICAL_GARDEN, byId["main"])).toBe(true);
  });

  it("keeps the inner areas inside the main outline", () => {
    const main = areas.features.find((f) => f.properties.kind === "main")!;
    const withAll = composeBoundary(areas, innerIds);
    expect(ha(withAll)).toBeCloseTo(ha(main), 1);
  });
});

describe("composeBoundary", () => {
  it("always contains the heart of campus and the Hill", () => {
    for (const include of [[], innerIds, optionalIds]) {
      const b = composeBoundary(areas, include);
      for (const spot of [ROYCE_HALL, BRUIN_PLAZA, DE_NEVE_PLAZA, BOTANICAL_GARDEN]) {
        expect(booleanPointInPolygon(spot, b)).toBe(true);
      }
      expect(booleanPointInPolygon(BEL_AIR, b)).toBe(false);
      expect(booleanPointInPolygon(WESTWOOD_AND_WILSHIRE, b)).toBe(false);
    }
  });

  it("cuts a hole when an inner area is left out", () => {
    const without = composeBoundary(areas, innerIds.filter((id) => id !== "drake-stadium"));
    const withAll = composeBoundary(areas, innerIds);
    expect(booleanPointInPolygon(DRAKE_STADIUM, without)).toBe(false);
    expect(booleanPointInPolygon(DRAKE_STADIUM, withAll)).toBe(true);
    const drake = areas.features.find((f) => f.properties.id === "drake-stadium")!;
    expect(ha(withAll) - ha(without)).toBeCloseTo(ha(drake), 1);
  });

  it("adds a detached area only when it is included", () => {
    expect(booleanPointInPolygon(WEYBURN_TERRACE, composeBoundary(areas, innerIds))).toBe(false);
    expect(booleanPointInPolygon(WEYBURN_TERRACE, composeBoundary(areas, [...innerIds, "southwest"]))).toBe(true);
  });

  it("makes D bigger when the detached areas stretch the map south", () => {
    const core = boundaryMetrics(composeBoundary(areas, innerIds)).diagonalM;
    const withSouthwest = boundaryMetrics(composeBoundary(areas, [...innerIds, "southwest"])).diagonalM;
    const everything = boundaryMetrics(composeBoundary(areas, optionalIds)).diagonalM;
    expect(core).toBeGreaterThan(2200);
    expect(core).toBeLessThan(2400);
    expect(withSouthwest).toBeGreaterThan(core + 300);
    expect(everything).toBeGreaterThanOrEqual(withSouthwest);
    expect(everything).toBeLessThan(2900);
  });
});

describe("campus.geojson", () => {
  it("is exactly what the current selection produces", () => {
    const rebuilt = composeBoundary(areas, selection.include);
    expect(ha(campus)).toBeCloseTo(ha(rebuilt), 2);
    expect(campus.properties.included.slice().sort()).toEqual(selection.include.slice().sort());
    expect(campus.properties.approved).toBe(selection.approved);
  });

  it("stores a bbox and diagonal that match its geometry", () => {
    const { bbox, diagonalM } = boundaryMetrics(campus);
    bbox.forEach((v, i) => expect(campus.properties.bbox[i]).toBeCloseTo(v, 6));
    expect(campus.properties.diagonal_m).toBeCloseTo(diagonalM, 0);
  });

  it("covers main campus and the Hill", () => {
    for (const spot of [ROYCE_HALL, BRUIN_PLAZA, DE_NEVE_PLAZA]) {
      expect(booleanPointInPolygon(spot, campus)).toBe(true);
    }
  });

  it("credits OpenStreetMap", () => {
    expect(campus.properties.attribution).toMatch(/OpenStreetMap/);
  });
});
