import { describe, expect, it } from "vitest";
import { rankOf } from "../src/components/versus/SeatBadge";
import { mergeState } from "../src/lib/game/api";
import type { GameState, RoundResult } from "../src/lib/game/types";
import { initialOf, normalizeRoomCode, ROOM_CODE_LETTERS, SEAT_COLORS, seatColor } from "../src/lib/versus/types";

describe("room codes", () => {
  it("uses no vowels and none of 0, O, 1, I", () => {
    expect(ROOM_CODE_LETTERS).toHaveLength(20);
    expect(ROOM_CODE_LETTERS).not.toMatch(/[AEIOUY01]/);
  });

  it("accepts a code however it is typed", () => {
    expect(normalizeRoomCode("BCDFG")).toBe("BCDFG");
    expect(normalizeRoomCode("bcdfg")).toBe("BCDFG");
    expect(normalizeRoomCode(" bcd-fg ")).toBe("BCDFG");
  });

  it("refuses anything that could not be a code", () => {
    for (const bad of ["", "BCDF", "BCDFGH", "BCDEF", "BCD1G", "BCDOG", "../..", "BCDF%"]) expect(normalizeRoomCode(bad), bad).toBeNull();
  });
});

describe("seats", () => {
  it("gives each of the five seats its own colour, none of them gold", () => {
    const colors = [1, 2, 3, 4, 5].map(seatColor);
    expect(new Set(colors).size).toBe(5);
    expect(colors).toEqual([...SEAT_COLORS]);
    expect(colors.map((c) => c.toUpperCase())).not.toContain("#FFD100");
    expect(seatColor(1).toUpperCase()).toBe("#2774AE");
  });

  it("takes the first letter of a name for the pin", () => {
    expect(initialOf("hank")).toBe("H");
    expect(initialOf("_under")).toBe("_");
    expect(initialOf("")).toBe("?");
  });

  it("ranks by total, sharing a place when level", () => {
    const totals = [9000, 12000, 9000, 300];
    expect(totals.map((t) => rankOf(t, totals))).toEqual([2, 1, 2, 4]);
  });
});

describe("taking a new game state from the server", () => {
  const result = (round: number, score: number): RoundResult => ({
    round,
    guess: { lat: 34.07, lng: -118.44 },
    answer: { lat: 34.071, lng: -118.441 },
    distanceM: 120,
    score,
    credit: { photographer: "A", source: "mapillary", license: "CC BY-SA 4.0", licenseUrl: null },
    reported: false,
    players: [{ seat: 1, guess: { lat: 34.07, lng: -118.44 }, distanceM: 120, score }],
  });
  const base: GameState = {
    id: "g", mode: "versus", status: "active", roundCount: 5, roundSeconds: 30,
    currentRound: 1, serverNow: 1000, totalScore: 0, round: null, results: [result(1, 3000)], versus: null,
  };

  it("takes the first state as it is", () => {
    expect(mergeState(null, base)).toBe(base);
  });

  it("drops an answer older than what is on screen", () => {
    const newer = { ...base, serverNow: 2000, currentRound: 2 };
    expect(mergeState(newer, base)).toBe(newer);
  });

  it("keeps the same result objects when nothing about them changed, so the map does not replay", () => {
    const next = { ...base, serverNow: 2000, results: [result(1, 3000)] };
    const merged = mergeState(base, next);
    expect(merged.serverNow).toBe(2000);
    expect(merged.results).toBe(base.results);
  });

  it("takes a result that did change, and new rounds", () => {
    const next = { ...base, serverNow: 2000, results: [{ ...result(1, 3000), reported: true }, result(2, 100)] };
    const merged = mergeState(base, next);
    expect(merged.results[0]).not.toBe(base.results[0]);
    expect(merged.results[0].reported).toBe(true);
    expect(merged.results).toHaveLength(2);
  });

  it("starts over for a different game", () => {
    const other = { ...base, id: "h", serverNow: 5 };
    expect(mergeState(base, other)).toBe(other);
  });
});
