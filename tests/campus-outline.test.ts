import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { bboxDiagonalMeters } from "../src/lib/geo/distance";
import outline from "../src/lib/map/campus-outline.json";
import { CAMPUS_BBOX, campusSvgPath, campusSvgPoint, paddedBbox } from "../src/lib/map/campus";

const root = path.resolve(import.meta.dirname, "..");
const campus = JSON.parse(readFileSync(path.join(root, "data/campus.geojson"), "utf8"));

describe("the campus outline the app draws", () => {
  it("is the approved boundary in data/campus.geojson (rebuild with npm run campus:build if this fails)", () => {
    expect(outline.bbox).toEqual(campus.bbox);
    expect(outline.diagonalM).toBe(campus.properties.diagonal_m);
    const polygons = campus.geometry.type === "Polygon" ? [campus.geometry.coordinates] : campus.geometry.coordinates;
    expect(outline.polygons).toEqual(polygons);
  });

  it("carries the scoring constant D that the database migration sets", () => {
    expect(outline.diagonalM).toBeCloseTo(bboxDiagonalMeters(CAMPUS_BBOX), 0);
    const migration = readFileSync(path.join(root, "supabase/migrations/20261115000200_single_player.sql"), "utf8");
    expect(migration).toContain(`insert into public.settings (campus_diagonal_m) values (${outline.diagonalM});`);
  });

  it("draws inside its box, north up", () => {
    const d = campusSvgPath(560, 520, 26);
    expect(d.startsWith("M")).toBe(true);
    const numbers = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
    expect(Math.min(...numbers)).toBeGreaterThanOrEqual(26 - 0.1);
    expect(Math.max(...numbers)).toBeLessThanOrEqual(560 - 26 + 0.1);

    const [w, s, e, n] = CAMPUS_BBOX;
    const [, northY] = campusSvgPoint((w + e) / 2, n, 560, 520, 26);
    const [, southY] = campusSvgPoint((w + e) / 2, s, 560, 520, 26);
    expect(northY).toBeLessThan(southY);
    const [westX] = campusSvgPoint(w, (s + n) / 2, 560, 520, 26);
    const [eastX] = campusSvgPoint(e, (s + n) / 2, 560, 520, 26);
    expect(westX).toBeLessThan(eastX);
  });

  it("pads the bounding box by a distance in meters", () => {
    const [w, s, e, n] = CAMPUS_BBOX;
    const padded = paddedBbox(1500);
    expect(bboxDiagonalMeters(padded)).toBeGreaterThan(bboxDiagonalMeters(CAMPUS_BBOX) + 2 * 1500);
    expect(padded[0]).toBeLessThan(w);
    expect(padded[1]).toBeLessThan(s);
    expect(padded[2]).toBeGreaterThan(e);
    expect(padded[3]).toBeGreaterThan(n);
    expect((s - padded[1]) * 111_320).toBeCloseTo(1500, 0);
  });
});
