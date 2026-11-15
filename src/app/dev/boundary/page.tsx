import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { AreaCollection } from "@/lib/geo/boundary";
import BoundaryReview, { type PhotoDot } from "./BoundaryReview";

export const metadata: Metadata = { title: "Boundary review (dev)" };

/**
 * Phase 0 review tool. Development only: it can draw photo locations, which are
 * the answers to the game, so it must never be reachable on the deployed site.
 */
export default function BoundaryPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <Suspense fallback={<p className="p-6 text-sm">Loading boundary data…</p>}>
      <BoundaryData />
    </Suspense>
  );
}

async function BoundaryData() {
  const root = process.cwd();
  const areas: AreaCollection = JSON.parse(
    await readFile(path.join(root, "data/campus-areas.geojson"), "utf8"),
  );
  const selection: { approved: boolean; include: string[] } = JSON.parse(
    await readFile(path.join(root, "data/campus-selection.json"), "utf8"),
  );

  // Optional and gitignored: written by `npm run campus:probe`.
  let dots: PhotoDot[] | null = null;
  try {
    dots = JSON.parse(await readFile(path.join(root, ".cache/review/photo-dots.json"), "utf8")).dots;
  } catch {
    dots = null;
  }

  return <BoundaryReview areas={areas} selection={selection} dots={dots} />;
}
