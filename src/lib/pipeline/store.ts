import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { campusShapes, zoneOf } from "./geo";
import type { Candidate, CatalogEntry, Decision, Published, Source } from "./types";

/**
 * Where the pipeline keeps its working files. Gitignored: it links photos to
 * locations and source IDs.
 */
export const pipelineDir = (root = process.cwd()) => path.join(root, ".cache/pipeline");

export const paths = (root = process.cwd()) => {
  const dir = pipelineDir(root);
  return {
    dir,
    processed: path.join(dir, "processed"),
    sheets: path.join(dir, "sheets"),
    candidates: (source: Source) => path.join(dir, "catalog", `${source}.json`),
    decisions: path.join(dir, "decisions.json"),
    published: path.join(dir, "published.json"),
  };
};

export async function readJson<T>(file: string, fallback: T): Promise<T> {
  if (!existsSync(file)) return fallback;
  return JSON.parse(await readFile(file, "utf8")) as T;
}

/** Writes via a temp file so a crash never leaves a half-written JSON file. */
export async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 1));
  await rename(tmp, file);
}

/** Stable, opaque name for a candidate's processed files. */
export const fileStem = (key: string) => createHash("sha1").update(key).digest("hex").slice(0, 20);

const SOURCES: Source[] = ["original", "mapillary", "wikimedia"];

export async function readCandidates(root = process.cwd()): Promise<Candidate[]> {
  const p = paths(root);
  const lists = await Promise.all(SOURCES.map((s) => readJson<Candidate[]>(p.candidates(s), [])));
  return lists.flat();
}

export const readDecisions = (root = process.cwd()) =>
  readJson<Record<string, Decision>>(paths(root).decisions, {});

export const readPublished = (root = process.cwd()) =>
  readJson<Record<string, Published>>(paths(root).published, {});

export async function saveDecision(key: string, patch: Decision, root = process.cwd()): Promise<Decision> {
  const file = paths(root).decisions;
  const all = await readJson<Record<string, Decision>>(file, {});
  const next: Decision = { ...all[key], ...patch, decidedAt: new Date().toISOString() };
  all[key] = next;
  await writeJson(file, all);
  return next;
}

/** Drops a hand-corrected location so the pin goes back to where the photo's own GPS had it. */
export async function clearLocationOverride(key: string, root = process.cwd()): Promise<Decision> {
  const file = paths(root).decisions;
  const all = await readJson<Record<string, Decision>>(file, {});
  const next: Decision = { ...all[key], decidedAt: new Date().toISOString() };
  delete next.lat;
  delete next.lng;
  all[key] = next;
  await writeJson(file, all);
  return next;
}

/** Applies decisions and publish state to one candidate. */
export function resolveEntry(
  c: Candidate,
  decision: Decision | undefined,
  published: Published | undefined,
  root = process.cwd(),
): CatalogEntry {
  const moved = decision?.lat !== undefined && decision?.lng !== undefined;
  const lat = moved ? decision!.lat! : c.lat;
  const lng = moved ? decision!.lng! : c.lng;
  const status = decision?.status ?? c.defaultStatus;
  const zone = lat !== null && lng !== null ? zoneOf(lng, lat, campusShapes(root)) : null;
  const shouldBeLive = status === "approved" && (zone === "inside" || zone === "buffer");
  const needsSync = published
    ? published.hidden === shouldBeLive || published.lat !== lat || published.lng !== lng
    : false;
  return {
    ...c,
    lat,
    lng,
    status,
    reason: decision?.reason ?? null,
    moved,
    origin: c.lat !== null && c.lng !== null ? { lat: c.lat, lng: c.lng } : null,
    zone,
    published: published ?? null,
    needsSync,
  };
}

/** Every candidate with decisions and publish state applied. */
export async function readCatalog(root = process.cwd()): Promise<CatalogEntry[]> {
  const [candidates, decisions, published] = await Promise.all([
    readCandidates(root),
    readDecisions(root),
    readPublished(root),
  ]);
  return candidates.map((c) => resolveEntry(c, decisions[c.key], published[c.key], root));
}

/** A photo goes live only when it is approved and sits inside the boundary or its buffer. */
export const isPublishable = (e: CatalogEntry): boolean =>
  e.status === "approved" && e.lat !== null && e.lng !== null && (e.zone === "inside" || e.zone === "buffer");
