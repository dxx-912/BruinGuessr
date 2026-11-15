import { describe, expect, it } from "vitest";
import { haversineMeters } from "../src/lib/geo/distance";
import { PIPELINE } from "../src/lib/pipeline/config";
import { facesCampus, headingDiff, stepAlongHeading, thinNearDuplicates, zoneOf } from "../src/lib/pipeline/geo";

const ROYCE = { lng: -118.44215, lat: 34.07292 };

/** Walks from a start point along a heading until the zone changes to `want`. */
function walkUntil(start: { lng: number; lat: number }, heading: number, want: string): { lng: number; lat: number } {
  for (let d = 0; d < 2000; d += 4) {
    const [lng, lat] = stepAlongHeading(start.lng, start.lat, heading, d);
    if (zoneOf(lng, lat) === want) return { lng, lat };
  }
  throw new Error(`never reached zone ${want}`);
}

describe("headingDiff", () => {
  it("measures the short way round the compass", () => {
    expect(headingDiff(10, 350)).toBe(20);
    expect(headingDiff(350, 10)).toBe(20);
    expect(headingDiff(0, 180)).toBe(180);
    expect(headingDiff(90, 90)).toBe(0);
    expect(headingDiff(-10, 370)).toBe(20);
  });
});

describe("stepAlongHeading", () => {
  it("moves the requested distance in the requested direction", () => {
    const north = stepAlongHeading(ROYCE.lng, ROYCE.lat, 0, 100);
    expect(north[0]).toBeCloseTo(ROYCE.lng, 9);
    expect(north[1]).toBeGreaterThan(ROYCE.lat);
    expect(haversineMeters(ROYCE, { lng: north[0], lat: north[1] })).toBeCloseTo(100, 0);

    const east = stepAlongHeading(ROYCE.lng, ROYCE.lat, 90, 100);
    expect(east[0]).toBeGreaterThan(ROYCE.lng);
    expect(east[1]).toBeCloseTo(ROYCE.lat, 9);
    expect(haversineMeters(ROYCE, { lng: east[0], lat: east[1] })).toBeCloseTo(100, 0);
  });
});

describe("zoneOf", () => {
  it("puts the middle of campus inside", () => {
    expect(zoneOf(ROYCE.lng, ROYCE.lat)).toBe("inside");
  });

  it("has a buffer ring about as wide as the configured buffer, then outside", () => {
    const edge = walkUntil(ROYCE, 90, "buffer"); // heading east toward Hilgard Ave
    const beyond = walkUntil(edge, 90, "outside");
    const width = haversineMeters(edge, beyond);
    expect(width).toBeGreaterThan(PIPELINE.bufferM - 8);
    expect(width).toBeLessThan(PIPELINE.bufferM + 8);
  });

  it("calls Westwood Village and Bel Air outside", () => {
    expect(zoneOf(-118.4432, 34.0595)).toBe("outside");
    expect(zoneOf(-118.445, 34.082)).toBe("outside");
  });
});

describe("facesCampus", () => {
  const justOutside = (() => {
    const p = walkUntil(ROYCE, 90, "buffer");
    const [lng, lat] = stepAlongHeading(p.lng, p.lat, 90, 15);
    return { lng, lat };
  })();

  it("accepts a camera on the street looking into campus", () => {
    expect(facesCampus(justOutside.lng, justOutside.lat, 270)).toBe(true);
  });

  it("rejects a camera looking away from campus", () => {
    expect(facesCampus(justOutside.lng, justOutside.lat, 90)).toBe(false);
  });

  it("accepts campus at the edge of the frame but not behind the camera", () => {
    // Looking along the boundary road with campus off to one side, inside the field of view.
    expect(facesCampus(justOutside.lng, justOutside.lat, 270 + 25, 70, 30)).toBe(true);
    expect(facesCampus(justOutside.lng, justOutside.lat, 90 + 25, 70, 30)).toBe(false);
  });

  it("looks only as far as it is told", () => {
    const far = stepAlongHeading(justOutside.lng, justOutside.lat, 90, 20); // ~35 m from the boundary
    expect(facesCampus(far[0], far[1], 270, 20, 0)).toBe(false);
    expect(facesCampus(far[0], far[1], 270, 70, 0)).toBe(true);
  });
});

describe("thinNearDuplicates", () => {
  const at = (meters: number, heading: number | null, score: number) => {
    const [lng, lat] = stepAlongHeading(ROYCE.lng, ROYCE.lat, 90, meters);
    return { lng, lat, heading, score };
  };

  it("keeps the better of two photos from the same spot facing the same way", () => {
    const kept = thinNearDuplicates([at(0, 90, 0.6), at(5, 95, 0.9)], 20, 40);
    expect(kept).toHaveLength(1);
    expect(kept[0].score).toBe(0.9);
  });

  it("keeps both when they face different ways", () => {
    expect(thinNearDuplicates([at(0, 90, 0.6), at(5, 200, 0.9)], 20, 40)).toHaveLength(2);
  });

  it("keeps both when they are far enough apart", () => {
    expect(thinNearDuplicates([at(0, 90, 0.6), at(30, 90, 0.9)], 20, 40)).toHaveLength(2);
  });

  it("treats a photo with no heading as a duplicate of anything that close", () => {
    expect(thinNearDuplicates([at(0, null, 0.6), at(5, 200, 0.9)], 20, 40)).toHaveLength(1);
  });

  it("spaces out a walk filmed every few meters", () => {
    const walk = Array.from({ length: 41 }, (_, i) => at(i * 5, 90, 0.5 + (i % 3) * 0.01)); // 200 m
    const kept = thinNearDuplicates(walk, 20, 40);
    expect(kept.length).toBeGreaterThanOrEqual(7);
    expect(kept.length).toBeLessThanOrEqual(11);
    for (const a of kept) for (const b of kept) if (a !== b) expect(haversineMeters(a, b)).toBeGreaterThan(20);
  });

  it("does not change its input", () => {
    const input = [at(0, 90, 0.1), at(5, 90, 0.9)];
    thinNearDuplicates(input, 20, 40);
    expect(input[0].score).toBe(0.1);
  });
});
