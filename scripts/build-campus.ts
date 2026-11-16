/**
 * Builds the campus boundary from OpenStreetMap.
 *
 *   npm run campus:build              use cached OSM downloads if present
 *   npm run campus:build -- --refresh download fresh copies from OpenStreetMap
 *
 * Writes:
 *   data/campus-areas.geojson   every candidate piece of campus (main outline + flagged edge areas)
 *   data/campus.geojson         the boundary itself, built from data/campus-selection.json
 *
 * data/campus-selection.json lists which flagged areas are in. It is the one
 * file to edit when the boundary decision changes; then re-run this script.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  area as turfArea,
  booleanPointInPolygon,
  centroid,
  difference,
  feature,
  featureCollection,
  intersect,
  multiPolygon,
  polygon,
  truncate,
} from "@turf/turf";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import osmtogeojson from "osmtogeojson";
import {
  boundaryMetrics,
  composeBoundary,
  type AreaCollection,
  type AreaFeature,
  type AreaProps,
  type BoundaryProps,
} from "../src/lib/geo/boundary";
import { bboxSizeMeters } from "../src/lib/geo/distance";

const ROOT = path.resolve(import.meta.dirname, "..");
const CACHE_DIR = path.join(ROOT, ".cache/osm");
const DATA_DIR = path.join(ROOT, "data");
const REFRESH = process.argv.includes("--refresh");

// OpenStreetMap objects this boundary is built from.
const OSM = {
  /** "University of California, Los Angeles" (amenity=university, multipolygon). */
  campus: { type: "relation", id: 7493269 },
  drakeStadium: { type: "way", id: 665447306 },
  sunsetCanyonRec: { type: "way", id: 44631347 },
  botanicalGarden: { type: "way", id: 44664275 },
} as const;

type OsmRef = { type: "relation" | "way"; id: number };
type Poly = Feature<Polygon | MultiPolygon>;

/**
 * The medical area is not one OSM object, so it is cut out of the main outline
 * along streets: everything south of Charles E. Young Drive South and west of
 * Tiverton Drive / Tiverton Avenue. The first points trace the centerlines of
 * those streets (taken from OSM); the rest just close the shape well outside campus.
 * The botanical garden is east of Tiverton and stays in the core.
 */
const MEDICAL_CUT: [lng: number, lat: number][] = [
  [-118.46, 34.06687], // west of campus, level with the west end of Charles E. Young Dr S
  [-118.44771, 34.06687], // Charles E. Young Dr S meets Gayley Ave
  [-118.44745, 34.06706],
  [-118.44706, 34.0671],
  [-118.44675, 34.06709],
  [-118.44577, 34.06699],
  [-118.44514, 34.06699], // crossing Westwood Plaza
  [-118.44379, 34.06701],
  [-118.44177, 34.06702], // corner with Tiverton Dr
  [-118.44178, 34.06492], // south along Tiverton Dr
  [-118.44248, 34.0641], // Tiverton Ave
  [-118.4426, 34.06309],
  [-118.4426, 34.06], // south of campus
  [-118.46, 34.06],
  [-118.46, 34.06687],
];

async function fetchOsm(ref: OsmRef): Promise<unknown> {
  const file = path.join(CACHE_DIR, `${ref.type}-${ref.id}.json`);
  if (!REFRESH && existsSync(file)) return JSON.parse(await readFile(file, "utf8"));
  const url = `https://api.openstreetmap.org/api/0.6/${ref.type}/${ref.id}/full.json`;
  const res = await fetch(url, { headers: { "User-Agent": "campus-boundary-builder/0.1" } });
  if (!res.ok) throw new Error(`OpenStreetMap returned HTTP ${res.status} for ${ref.type}/${ref.id}`);
  const text = await res.text();
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(file, text);
  console.log(`  downloaded ${ref.type}/${ref.id}`);
  return JSON.parse(text);
}

async function osmPolygon(ref: OsmRef): Promise<Poly> {
  const fc = osmtogeojson(await fetchOsm(ref)) as FeatureCollection;
  const found = fc.features.find(
    (f) => f.id === `${ref.type}/${ref.id}` && (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon"),
  );
  if (!found) throw new Error(`${ref.type}/${ref.id} did not convert to a polygon`);
  return feature(found.geometry as Polygon | MultiPolygon);
}

const hectares = (f: Poly) => Math.round(turfArea(f) / 1000) / 10;

function clip(a: Poly, b: Poly, what: string): Poly {
  const out = intersect(featureCollection<Polygon | MultiPolygon>([a, b]));
  if (!out) throw new Error(`${what}: the two shapes do not overlap`);
  return out;
}

function subtract(a: Poly, b: Poly, what: string): Poly {
  const out = difference(featureCollection<Polygon | MultiPolygon>([a, b]));
  if (!out) throw new Error(`${what}: nothing left after subtracting`);
  return out;
}

function area(geometry: Poly, props: Omit<AreaProps, "area_ha">): AreaFeature {
  const tidy = truncate(geometry, { precision: 6, coordinates: 2 });
  return feature(tidy.geometry, { ...props, area_ha: hectares(tidy) }, { id: props.id }) as AreaFeature;
}

async function main() {
  console.log("Building campus boundary from OpenStreetMap");

  // --- 1. The OSM outline: one big polygon plus detached pieces ------------------------
  const outline = await osmPolygon(OSM.campus);
  const parts = (outline.geometry.type === "Polygon" ? [outline.geometry.coordinates] : outline.geometry.coordinates)
    .map((coords) => polygon(coords))
    .sort((a, b) => turfArea(b) - turfArea(a));
  if (parts.length !== 7) {
    console.warn(`  ! expected 7 parts in the OSM outline, found ${parts.length}. Check the flagged areas below.`);
  }
  const [mainPart, ...detached] = parts;
  // The southwest block (Weyburn Terrace, Geffen Academy, Lots 32/33/36) is the only
  // detached piece bigger than a few buildings.
  const southwest = detached.filter((p) => turfArea(p) > 50_000);
  const village = detached.filter((p) => turfArea(p) <= 50_000);
  if (southwest.length !== 1) throw new Error(`expected one large detached block, found ${southwest.length}`);

  // --- 2. Flagged areas inside the main outline ----------------------------------------
  const garden = await osmPolygon(OSM.botanicalGarden);
  let medical = clip(mainPart, polygon([MEDICAL_CUT]), "medical area");
  if (intersect(featureCollection<Polygon | MultiPolygon>([medical, garden]))) {
    medical = subtract(medical, garden, "medical area minus botanical garden");
  }
  const drake = clip(mainPart, await osmPolygon(OSM.drakeStadium), "Drake Stadium");
  const sunsetRec = clip(mainPart, await osmPolygon(OSM.sunsetCanyonRec), "Sunset Canyon Recreation Center");

  // Sanity checks: each flagged area should contain the landmark it is named after.
  const mustContain: [string, Poly, [number, number]][] = [
    ["medical area ⊃ Ronald Reagan UCLA Medical Center", medical, [-118.44634, 34.06646]],
    ["medical area ⊃ Center for Health Sciences", medical, [-118.44309, 34.06622]],
    ["southwest block ⊃ Weyburn Terrace", southwest[0], [-118.4497, 34.0612]],
  ];
  for (const [label, shape, point] of mustContain) {
    if (!booleanPointInPolygon(point, shape)) throw new Error(`sanity check failed: ${label}`);
  }
  if (booleanPointInPolygon(centroid(garden), medical)) {
    throw new Error("sanity check failed: the botanical garden ended up inside the medical area");
  }

  // --- 3. Write every candidate area ---------------------------------------------------
  const areas: AreaCollection = featureCollection([
    area(mainPart, {
      id: "main",
      name: "Main campus and the Hill",
      kind: "main",
      recommend: "include",
      note: "The single large polygon in OpenStreetMap's UCLA outline: Sunset Blvd to Le Conte Ave, Veteran Ave to Hilgard Ave. Always part of the boundary.",
    }),
    area(medical, {
      id: "medical",
      name: "Medical center and health sciences",
      kind: "inner",
      recommend: "include",
      note: "Ronald Reagan UCLA Medical Center, the medical plaza buildings, the Center for Health Sciences and Jules Stein: everything south of Charles E. Young Dr South and west of Tiverton Dr. Students walk past it daily and Westwood Plaza runs through it, so I would keep it. Leaving it out pulls the south edge up and makes scoring slightly stricter.",
    }),
    area(drake, {
      id: "drake-stadium",
      name: "Drake Stadium",
      kind: "inner",
      recommend: "include",
      note: "Track and field stadium between the Hill and Bruin Walk. It is in the middle of campus, so leaving it out would only punch a hole in the map. It does not affect D.",
    }),
    area(sunsetRec, {
      id: "sunset-canyon-rec",
      name: "Sunset Canyon Recreation Center",
      kind: "inner",
      recommend: "include",
      note: "Pools, amphitheater and fields at the top of the Hill. It is surrounded by residence halls, so I would keep it. No open photos exist here yet; it depends on your own photos.",
    }),
    area(southwest[0], {
      id: "southwest",
      name: "Southwest campus (Weyburn Terrace)",
      kind: "detached",
      recommend: "exclude",
      note: "Graduate housing (Weyburn Terrace), Geffen Academy, Kinross buildings and Lots 32, 33 and 36, south of Le Conte and separate from the main campus. Most undergrads never go here, and including it stretches the map about 650 m south, which makes every score more lenient.",
    }),
    area(multiPolygon(village.map((p) => p.geometry.coordinates)), {
      id: "westwood-village",
      name: "Westwood Village buildings",
      kind: "detached",
      recommend: "exclude",
      note: "Five single buildings that UCLA owns in Westwood Village: Wilshire Center, Gayley Center, Gayley Heights, Levering Terrace and Village Terrace. They read as Westwood, not campus, and Wilshire Center alone would stretch the map to Wilshire Blvd.",
    }),
  ]);
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(path.join(DATA_DIR, "campus-areas.geojson"), JSON.stringify(areas, null, 1) + "\n");

  // --- 4. Build the boundary from the current selection --------------------------------
  const selectionFile = path.join(DATA_DIR, "campus-selection.json");
  const optional = areas.features.filter((f) => f.properties.kind !== "main");
  let selection: { approved: boolean; include: string[] };
  if (existsSync(selectionFile)) {
    selection = JSON.parse(await readFile(selectionFile, "utf8"));
  } else {
    selection = {
      approved: false,
      include: optional.filter((f) => f.properties.recommend === "include").map((f) => f.properties.id),
    };
    await writeFile(selectionFile, JSON.stringify(selection, null, 2) + "\n");
  }
  const known = new Set(optional.map((f) => f.properties.id));
  const unknown = selection.include.filter((id) => !known.has(id));
  if (unknown.length) throw new Error(`campus-selection.json lists unknown areas: ${unknown.join(", ")}`);

  const shape = truncate(composeBoundary(areas, selection.include), { precision: 6, coordinates: 2 });
  const { bbox, diagonalM } = boundaryMetrics(shape);
  const props: BoundaryProps = {
    name: "UCLA campus (BruinGuessr boundary)",
    included: selection.include,
    excluded: optional.map((f) => f.properties.id).filter((id) => !selection.include.includes(id)),
    bbox,
    diagonal_m: Math.round(diagonalM * 10) / 10,
    approved: selection.approved,
    source: `OpenStreetMap relation ${OSM.campus.id} (amenity=university), with flagged areas cut along OSM features and streets`,
    attribution: "© OpenStreetMap contributors, Open Database License (ODbL) 1.0",
  };
  const boundary = feature(shape.geometry, props, { bbox });
  await writeFile(path.join(DATA_DIR, "campus.geojson"), JSON.stringify(boundary, null, 1) + "\n");

  // The same outline in a small file the app can import directly (the game map
  // and the home page drawing). tests/campus-outline.test.ts checks the two agree.
  const polygons = shape.geometry.type === "Polygon" ? [shape.geometry.coordinates] : shape.geometry.coordinates;
  const outlineFile = { bbox, diagonalM: props.diagonal_m, polygons };
  await writeFile(path.join(DATA_DIR, "../src/lib/map/campus-outline.json"), JSON.stringify(outlineFile) + "\n");

  // --- 5. Report -----------------------------------------------------------------------
  const size = bboxSizeMeters(bbox);
  console.log("\nCandidate areas:");
  for (const f of areas.features) {
    const p = f.properties;
    const state = p.kind === "main" ? "always in" : selection.include.includes(p.id) ? "IN" : "out";
    console.log(`  ${p.id.padEnd(18)} ${String(p.area_ha).padStart(6)} ha  ${p.kind.padEnd(8)} ${state}`);
  }
  console.log(`\nBoundary (${selection.approved ? "APPROVED" : "not yet approved"}):`);
  console.log(`  area      ${hectares(shape)} ha`);
  console.log(`  bbox      ${bbox.map((n) => n.toFixed(6)).join(", ")}`);
  console.log(`  size      ${size.width.toFixed(0)} m wide × ${size.height.toFixed(0)} m tall`);
  console.log(`  D         ${props.diagonal_m} m`);
  console.log("\nWrote data/campus-areas.geojson, data/campus.geojson and src/lib/map/campus-outline.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
