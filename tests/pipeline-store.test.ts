import { describe, expect, it } from "vitest";
import { planPublish } from "../src/lib/pipeline/publish";
import { fileStem, isPublishable, resolveEntry } from "../src/lib/pipeline/store";
import type { Candidate, Published } from "../src/lib/pipeline/types";

const ROYCE = { lat: 34.07292, lng: -118.44215 };
const WESTWOOD = { lat: 34.0595, lng: -118.4432 };

const candidate = (over: Partial<Candidate> = {}): Candidate => ({
  key: "original:abc",
  source: "original",
  sourceId: "abc",
  ...ROYCE,
  heading: 90,
  capturedAt: null,
  photographer: "Tester",
  photographerUrl: null,
  license: "test",
  licenseUrl: null,
  sourceUrl: null,
  file: "processed/x.webp",
  thumb: "processed/x.thumb.webp",
  width: 1600,
  height: 1200,
  sharpness: 300,
  quality: null,
  onFoot: true,
  defaultStatus: "pending",
  notes: [],
  ...over,
});

const live = (over: Partial<Published> = {}): Published => ({ imageId: "id-1", storagePath: "r.webp", ...ROYCE, hidden: false, ...over });

describe("resolveEntry", () => {
  it("uses the default status until someone decides", () => {
    expect(resolveEntry(candidate(), undefined, undefined).status).toBe("pending");
    expect(resolveEntry(candidate(), { status: "approved" }, undefined).status).toBe("approved");
  });

  it("applies a dragged pin and remembers where GPS had it", () => {
    const e = resolveEntry(candidate(), { lat: 34.0705, lng: -118.4501 }, undefined);
    expect(e.moved).toBe(true);
    expect([e.lat, e.lng]).toEqual([34.0705, -118.4501]);
    expect(e.origin).toEqual(ROYCE);
    expect(e.zone).toBe("inside");
  });

  it("works out the zone, including none for a photo without GPS", () => {
    expect(resolveEntry(candidate(), undefined, undefined).zone).toBe("inside");
    expect(resolveEntry(candidate(WESTWOOD), undefined, undefined).zone).toBe("outside");
    const noGps = resolveEntry(candidate({ lat: null, lng: null }), undefined, undefined);
    expect(noGps.zone).toBeNull();
    expect(noGps.origin).toBeNull();
  });

  it("flags a live photo whose pin or status changed", () => {
    expect(resolveEntry(candidate(), { status: "approved" }, live()).needsSync).toBe(false);
    expect(resolveEntry(candidate(), { status: "approved", lat: 34.0705, lng: -118.4501 }, live()).needsSync).toBe(true);
    expect(resolveEntry(candidate(), { status: "rejected" }, live()).needsSync).toBe(true);
    expect(resolveEntry(candidate(), { status: "rejected" }, live({ hidden: true })).needsSync).toBe(false);
  });
});

describe("isPublishable", () => {
  const entry = (c: Partial<Candidate>, status: "approved" | "pending" | "rejected") => resolveEntry(candidate(c), { status }, undefined);

  it("needs approval, a pin, and a location in or next to campus", () => {
    expect(isPublishable(entry({}, "approved"))).toBe(true);
    expect(isPublishable(entry({}, "pending"))).toBe(false);
    expect(isPublishable(entry({}, "rejected"))).toBe(false);
    expect(isPublishable(entry({ lat: null, lng: null }, "approved"))).toBe(false);
    expect(isPublishable(entry(WESTWOOD, "approved"))).toBe(false);
  });
});

describe("planPublish", () => {
  const e = (key: string, decision: Parameters<typeof resolveEntry>[1], published?: Published, c: Partial<Candidate> = {}) =>
    resolveEntry(candidate({ key, sourceId: key, ...c }), decision, published);

  it("sorts every photo into exactly the action it needs", () => {
    const plan = planPublish([
      e("new-approved", { status: "approved" }),
      e("new-pending", undefined),
      e("live-unchanged", { status: "approved" }, live()),
      e("live-moved", { status: "approved", lat: 34.0705, lng: -118.4501 }, live()),
      e("live-rejected", { status: "rejected" }, live()),
      e("live-dragged-off-campus", { status: "approved", ...WESTWOOD }, live()),
      e("withdrawn-then-approved", { status: "approved" }, live({ hidden: true })),
      e("withdrawn-still-rejected", { status: "rejected" }, live({ hidden: true })),
    ]);
    const keys = (list: { key: string }[]) => list.map((x) => x.key);
    expect(keys(plan.add)).toEqual(["new-approved"]);
    expect(keys(plan.move)).toEqual(["live-moved"]);
    expect(keys(plan.hide).sort()).toEqual(["live-dragged-off-campus", "live-rejected"]);
    expect(keys(plan.restore)).toEqual(["withdrawn-then-approved"]);
  });

  it("has nothing to do when the game already matches", () => {
    const plan = planPublish([e("a", { status: "approved" }, live()), e("b", { status: "rejected" })]);
    expect(plan.add.length + plan.move.length + plan.hide.length + plan.restore.length).toBe(0);
  });
});

describe("fileStem", () => {
  it("is stable, opaque and does not contain the source ID", () => {
    const stem = fileStem("mapillary:1234567890");
    expect(stem).toBe(fileStem("mapillary:1234567890"));
    expect(stem).toMatch(/^[0-9a-f]{20}$/);
    expect(stem).not.toContain("1234567890");
    expect(stem).not.toBe(fileStem("mapillary:1234567891"));
  });
});
