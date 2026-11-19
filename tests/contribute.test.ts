import { describe, expect, it } from "vitest";
import { cameraHeading, compassPoint } from "../src/lib/contribute/compass";
import { area, grow, iou, MAX_BLUR_BOXES, mergeBoxes, normalisedBoxes, suggestedBoxes, tiles, TILE_FRACTIONS } from "../src/lib/contribute/faces";
import { checkMeta, fixState, insideCampus, MAX_ACCURACY_M, scaledSize, trueHeading } from "../src/lib/contribute/rules";
import { groupCredits } from "../src/lib/credits";

const ROYCE = { lat: 34.07283, lng: -118.44222 };
const HEDRICK = { lat: 34.07325, lng: -118.45228 }; // the Hill
const WESTWOOD_VILLAGE = { lat: 34.0604, lng: -118.4466 };
const SANTA_MONICA = { lat: 34.0195, lng: -118.4912 };

describe("the campus boundary for contributions", () => {
  it("takes Royce Hall and the Hill, not Westwood Village or Santa Monica", () => {
    expect(insideCampus(ROYCE.lat, ROYCE.lng)).toBe(true);
    expect(insideCampus(HEDRICK.lat, HEDRICK.lng)).toBe(true);
    expect(insideCampus(WESTWOOD_VILLAGE.lat, WESTWOOD_VILLAGE.lng)).toBe(false);
    expect(insideCampus(SANTA_MONICA.lat, SANTA_MONICA.lng)).toBe(false);
    expect(insideCampus(Number.NaN, ROYCE.lng)).toBe(false);
  });
});

describe("headings", () => {
  it("turns magnetic into true north (11.5° east at UCLA) and wraps", () => {
    expect(trueHeading(0)).toBe(11.5);
    expect(trueHeading(350)).toBe(1.5);
    expect(trueHeading(348.5)).toBe(0);
    expect(trueHeading(348.47)).toBe(0); // rounds to 360.0, which is 0
    expect(trueHeading(-20)).toBe(351.5);
  });

  it("finds where the back camera points from the orientation sensors", () => {
    expect(cameraHeading(0, 90, 0)).toBe(0); // upright, facing north
    expect(cameraHeading(90, 90, 0)).toBe(270); // turned left: west
    expect(cameraHeading(270, 90, 0)).toBe(90);
    expect(cameraHeading(0, 0, 0)).toBeNull(); // flat on a table: no useful heading
    expect(cameraHeading(null, 90, 0)).toBeNull();
    expect(compassPoint(0)).toBe("N");
    expect(compassPoint(47)).toBe("NE");
    expect(compassPoint(359)).toBe("N");
  });
});

describe("capture size", () => {
  it("scales the long edge to 2048 and never enlarges", () => {
    expect(scaledSize(4032, 3024)).toEqual({ width: 2048, height: 1536 });
    expect(scaledSize(3024, 4032)).toEqual({ width: 1536, height: 2048 });
    expect(scaledSize(1280, 720)).toEqual({ width: 1280, height: 720 });
  });
});

describe("the shutter's position rules", () => {
  const now = 1_800_000_000_000;
  const fix = (over: Partial<{ lat: number; lng: number; accuracy: number; at: number }> = {}) => ({ ...ROYCE, accuracy: 12, at: now - 1000, ...over });
  it("needs a fresh, accurate fix inside campus", () => {
    expect(fixState(null, now)).toBe("none");
    expect(fixState(fix(), now)).toBe("ok");
    expect(fixState(fix({ accuracy: MAX_ACCURACY_M }), now)).toBe("ok");
    expect(fixState(fix({ accuracy: 40.1 }), now)).toBe("inaccurate");
    expect(fixState(fix({ at: now - 10_500 }), now)).toBe("stale");
    expect(fixState(fix(WESTWOOD_VILLAGE), now)).toBe("outside");
  });
});

describe("what the server accepts with a photo", () => {
  const now = 1_800_000_000_000;
  const good = {
    ...ROYCE,
    accuracy: 18.3,
    positionAt: now - 4000,
    capturedAt: now - 1000,
    heading: 90,
    captureWidth: 4032,
    captureHeight: 3024,
    people: false,
    boxes: [],
    license: true,
  };
  const problem = (over: Record<string, unknown>) => {
    const r = checkMeta({ ...good, ...over }, now);
    return "problem" in r ? r.problem : "ok";
  };

  it("accepts a good submission", () => {
    const r = checkMeta(good, now);
    expect("meta" in r && r.meta).toMatchObject({ lat: ROYCE.lat, accuracy: 18.3, heading: 90, people: false, boxes: [] });
  });
  it("keeps the detector's suggested boxes, clipped to the photo", () => {
    const r = checkMeta({ ...good, boxes: [{ x: 0.95, y: 0.1, w: 0.2, h: 0.05 }] }, now);
    expect("meta" in r && r.meta.boxes).toEqual([{ x: 0.95, y: 0.1, w: 0.05, h: 0.05 }]);
  });
  it("needs the license ticked and the people question answered", () => {
    expect(problem({ license: false })).toBe("license");
    expect(problem({ license: "yes" })).toBe("license");
    expect(problem({ people: null })).toBe("people_answer");
  });
  it("refuses accuracy worse than 40 m, positions off campus, and old fixes", () => {
    expect(problem({ accuracy: 40 })).toBe("ok");
    expect(problem({ accuracy: 40.5 })).toBe("too_inaccurate");
    expect(problem(WESTWOOD_VILLAGE)).toBe("outside_campus");
    expect(problem({ positionAt: now - 13_000 })).toBe("stale_position");
    expect(problem({ positionAt: now + 5000 })).toBe("stale_position");
  });
  it("refuses a capture time far from the server's clock", () => {
    expect(problem({ capturedAt: now - 2 * 86_400_000, positionAt: now - 2 * 86_400_000 })).toBe("clock");
    expect(problem({ capturedAt: now + 3_600_000, positionAt: now + 3_600_000 })).toBe("clock");
  });
  it("refuses malformed fields", () => {
    expect(problem({ heading: 400 })).toBe("bad_request");
    expect(problem({ heading: "north" })).toBe("bad_request");
    expect(problem({ boxes: undefined })).toBe("bad_request");
    expect(problem({ boxes: 3 })).toBe("bad_request");
    expect(problem({ boxes: [{ x: 0, y: 0 }] })).toBe("bad_request");
    expect(problem({ boxes: Array.from({ length: MAX_BLUR_BOXES + 1 }, () => ({ x: 0, y: 0, w: 0.1, h: 0.1 })) })).toBe("bad_request");
    expect(problem({ captureWidth: 0 })).toBe("bad_request");
    expect(problem({ lat: "34" })).toBe("bad_request");
    expect(checkMeta(null, now)).toEqual({ problem: "bad_request" });
  });
  it("takes no heading", () => {
    const r = checkMeta({ ...good, heading: null }, now);
    expect("meta" in r && r.meta.heading).toBeNull();
  });
});

describe("the tiled face search", () => {
  it("covers a 2048 × 1536 photo at every window size, with overlap, edges included", () => {
    for (const f of TILE_FRACTIONS) {
      const list = tiles(2048, 1536, f);
      const size = Math.round(2048 * f);
      // Every pixel column and row is inside some window.
      for (const x of [0, 1, 777, 2047]) expect(list.some((t) => x >= t.x && x < t.x + t.w)).toBe(true);
      for (const y of [0, 1, 999, 1535]) expect(list.some((t) => y >= t.y && y < t.y + t.h)).toBe(true);
      expect(list.every((t) => t.x >= 0 && t.y >= 0 && t.x + t.w <= 2048 && t.y + t.h <= 1536)).toBe(true);
      if (f < 1) expect(list.every((t) => t.w === size)).toBe(true);
    }
    expect(tiles(2048, 1536, 1)).toEqual([{ x: 0, y: 0, w: 2048, h: 1536 }]);
    expect(tiles(2048, 1536, 0.125).length).toBeGreaterThan(80);
  });

  it("counts a face found in several windows once, keeping the best", () => {
    const merged = mergeBoxes([
      { x: 100, y: 100, w: 40, h: 40, score: 0.7 },
      { x: 102, y: 101, w: 38, h: 41, score: 0.9 },
      { x: 110, y: 110, w: 20, h: 20, score: 0.6 }, // inside the first: the same face
      { x: 600, y: 300, w: 30, h: 30, score: 0.6 },
    ]);
    expect(merged.map((b) => b.score)).toEqual([0.9, 0.6]);
    expect(iou({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 10, h: 10 })).toBe(1);
    expect(iou({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 10, h: 10 })).toBe(0);
  });

  it("grows a blur box about its centre, inside the picture", () => {
    expect(grow({ x: 100, y: 100, w: 10, h: 10 }, 1.4, 1000, 1000)).toEqual({ x: 98, y: 98, w: 14, h: 14 });
    const edge = grow({ x: 0, y: 0, w: 10, h: 10 }, 2, 12, 12);
    expect(edge.x).toBe(0);
    expect(edge.x + edge.w).toBeLessThanOrEqual(12);
    expect(area(edge)).toBeGreaterThan(0);
  });
});

describe("blur boxes", () => {
  it("turns the detector's finds into suggestions: grown, as fractions, best first, capped", () => {
    const found = [
      { x: 100, y: 100, w: 20, h: 20, score: 0.6 },
      { x: 1000, y: 500, w: 100, h: 100, score: 0.9 },
    ];
    expect(suggestedBoxes(found, 2000, 1000)).toEqual([
      { x: 0.49, y: 0.48, w: 0.07, h: 0.14 },
      { x: 0.048, y: 0.096, w: 0.014, h: 0.028 },
    ]);
    const many = Array.from({ length: 150 }, (_, i) => ({ x: i * 10, y: 0, w: 8, h: 8, score: i / 150 }));
    const capped = suggestedBoxes(many, 2048, 1536);
    expect(capped).toHaveLength(MAX_BLUR_BOXES);
    // What the phone sends is what the server accepts.
    expect(normalisedBoxes(capped)).toEqual(capped);
  });

  it("clips to the photo, drops slivers and refuses junk", () => {
    expect(normalisedBoxes([{ x: 0.9, y: -0.1, w: 0.3, h: 0.2 }])).toEqual([{ x: 0.9, y: 0, w: 0.1, h: 0.2 }]);
    expect(normalisedBoxes([{ x: 0.5, y: 0.5, w: 0.0001, h: 0.1 }])).toEqual([]);
    expect(normalisedBoxes([{ x: "0.1", y: 0, w: 0.1, h: 0.1 }])).toBeNull();
    expect(normalisedBoxes("boxes")).toBeNull();
    expect(normalisedBoxes(Array.from({ length: MAX_BLUR_BOXES + 1 }, () => ({ x: 0, y: 0, w: 0.1, h: 0.1 })))).toBeNull();
    expect(normalisedBoxes([])).toEqual([]);
  });
});

describe("credits for players' photos", () => {
  it("puts players first, by username, under CC BY-SA 4.0", () => {
    const groups = groupCredits([
      { source: "mapillary", photographer: "mapper", license: "CC BY-SA 4.0", license_url: null },
      { source: "community", photographer: "bruin_42", license: "CC BY-SA 4.0", license_url: "https://creativecommons.org/licenses/by-sa/4.0/" },
      { source: "community", photographer: "", license: "CC BY-SA 4.0", license_url: null },
    ]);
    expect(groups.map((g) => g.source)).toEqual(["community", "mapillary"]);
    expect(groups[0].photographers).toEqual([
      { name: "bruin_42", licenses: [{ name: "CC BY-SA 4.0", fullName: "Creative Commons Attribution-ShareAlike 4.0", url: "https://creativecommons.org/licenses/by-sa/4.0/" }] },
    ]);
  });
});
