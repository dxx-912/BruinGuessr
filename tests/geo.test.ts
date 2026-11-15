import { describe, expect, it } from "vitest";
import { bboxDiagonalMeters, bboxSizeMeters, haversineMeters } from "../src/lib/geo/distance";
import { isBullseye, MAX_ROUND_SCORE, PERFECT_RADIUS_M, scoreForDistance } from "../src/lib/geo/scoring";

const ROYCE_HALL = { lng: -118.44215, lat: 34.07292 };
const POWELL_LIBRARY = { lng: -118.44215, lat: 34.07163 };

describe("haversineMeters", () => {
  it("is zero for the same point", () => {
    expect(haversineMeters(ROYCE_HALL, ROYCE_HALL)).toBe(0);
  });

  it("is symmetric", () => {
    expect(haversineMeters(ROYCE_HALL, POWELL_LIBRARY)).toBeCloseTo(haversineMeters(POWELL_LIBRARY, ROYCE_HALL), 9);
  });

  it("measures one degree of latitude as about 111.2 km", () => {
    expect(haversineMeters({ lng: 0, lat: 0 }, { lng: 0, lat: 1 })).toBeCloseTo(111_195.08, 0);
  });

  it("shrinks a degree of longitude by the cosine of the latitude", () => {
    const atEquator = haversineMeters({ lng: 0, lat: 0 }, { lng: 1, lat: 0 });
    const atUcla = haversineMeters({ lng: -118, lat: 34.07 }, { lng: -117, lat: 34.07 });
    expect(atUcla / atEquator).toBeCloseTo(Math.cos((34.07 * Math.PI) / 180), 3);
  });

  it("puts Royce Hall and Powell Library about 143 m apart across the quad", () => {
    expect(haversineMeters(ROYCE_HALL, POWELL_LIBRARY)).toBeCloseTo(143.4, 0);
  });
});

describe("bbox helpers", () => {
  const box = [-118.455399, 34.06376, -118.437416, 34.078078] as [number, number, number, number];

  it("diagonal is the corner-to-corner distance", () => {
    expect(bboxDiagonalMeters(box)).toBeCloseTo(
      haversineMeters({ lng: box[0], lat: box[1] }, { lng: box[2], lat: box[3] }),
      9,
    );
  });

  it("diagonal agrees with Pythagoras on width and height at campus scale", () => {
    const { width, height } = bboxSizeMeters(box);
    expect(bboxDiagonalMeters(box)).toBeCloseTo(Math.hypot(width, height), 0);
  });
});

describe("scoreForDistance", () => {
  const D = 2300;

  it("gives a perfect 5,000 anywhere within 10 m", () => {
    for (const d of [0, 1, 5, 9.99, PERFECT_RADIUS_M]) {
      expect(scoreForDistance(d, D)).toBe(MAX_ROUND_SCORE);
    }
  });

  it("starts dropping just past 10 m", () => {
    expect(scoreForDistance(11, D)).toBeLessThan(MAX_ROUND_SCORE);
    expect(scoreForDistance(11, D)).toBe(Math.round(5000 * Math.exp(-10 / D)));
  });

  it("matches the spec formula at sample distances", () => {
    for (const d of [25, 50, 100, 200, 400, 800, 2300]) {
      expect(scoreForDistance(d, D)).toBe(Math.round(5000 * Math.exp((-10 * (d - 10)) / D)));
    }
  });

  it("never increases as the guess gets farther away", () => {
    let prev = MAX_ROUND_SCORE;
    for (let d = 0; d <= 5000; d += 7) {
      const s = scoreForDistance(d, D);
      expect(s).toBeLessThanOrEqual(prev);
      prev = s;
    }
  });

  it("is an integer between 0 and 5,000", () => {
    for (const d of [0, 10, 33.3, 999, 1e6]) {
      const s = scoreForDistance(d, D);
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(MAX_ROUND_SCORE);
    }
  });

  it("is more forgiving on a bigger campus", () => {
    expect(scoreForDistance(200, 2800)).toBeGreaterThan(scoreForDistance(200, 2300));
  });

  it("rejects nonsense input", () => {
    expect(() => scoreForDistance(100, 0)).toThrow();
    expect(() => scoreForDistance(-1, D)).toThrow();
    expect(() => scoreForDistance(Number.NaN, D)).toThrow();
  });
});

describe("isBullseye", () => {
  it("is true at 10 m and false just past it", () => {
    expect(isBullseye(10)).toBe(true);
    expect(isBullseye(10.01)).toBe(false);
  });
});
