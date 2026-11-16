import { describe, expect, it } from "vitest";
import { formatClock, formatDistance, formatImperial, formatPoints, gameVerdict, roundVerdict } from "../src/lib/game/format";
import { maxTotal, phaseOf, type GameState } from "../src/lib/game/types";

describe("formatting for the game screens", () => {
  it("writes points with thousands separators", () => {
    expect(formatPoints(0)).toBe("0");
    expect(formatPoints(4321)).toBe("4,321");
    expect(formatPoints(25000)).toBe("25,000");
  });

  it("writes distances in meters, then kilometers", () => {
    expect(formatDistance(0)).toBe("under 1 m");
    expect(formatDistance(7.4)).toBe("7 m");
    expect(formatDistance(84.3)).toBe("84 m");
    expect(formatDistance(999.4)).toBe("999 m");
    expect(formatDistance(1234)).toBe("1.2 km");
    expect(formatDistance(4_000_000)).toBe("4,000 km");
  });

  it("gives the same distance in feet or miles", () => {
    expect(formatImperial(7.4)).toBe("24 ft");
    expect(formatImperial(0.1)).toBe("1 ft");
    expect(formatImperial(997)).toBe("0.6 mi");
  });

  it("shows the clock rounded up, so 0:00 means time is really out", () => {
    expect(formatClock(30_000)).toBe("0:30");
    expect(formatClock(29_999)).toBe("0:30");
    expect(formatClock(29_000)).toBe("0:29");
    expect(formatClock(1)).toBe("0:01");
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(-500)).toBe("0:00");
    expect(formatClock(90_000)).toBe("1:30");
  });

  it("reacts to a round's score", () => {
    expect(roundVerdict(0, false)).toBe("No guess");
    expect(roundVerdict(5000, true)).toBe("Bullseye");
    expect(roundVerdict(4800, true)).toBe("So close");
    expect(roundVerdict(60, true)).toBe("Way off");
  });

  it("reacts to a whole game", () => {
    expect(gameVerdict(25000, 25000)).toBe("A perfect game");
    expect(gameVerdict(20000, 25000)).toBe("True Bruin");
    expect(gameVerdict(0, 25000)).toBe("Were you guessing from Westwood?");
  });
});

describe("working out which screen a game is on", () => {
  const base: GameState = {
    id: "g", mode: "solo", status: "active", roundCount: 5, roundSeconds: 30,
    currentRound: 0, serverNow: 0, totalScore: 0, round: null, results: [],
  };
  const open = { number: 2, startsAt: 0, deadlineAt: 30_000, graceMs: 1500, pin: null };

  it("follows the game from first round to summary", () => {
    expect(phaseOf(base)).toBe("ready");
    expect(phaseOf({ ...base, currentRound: 2, round: open })).toBe("guessing");
    expect(phaseOf({ ...base, currentRound: 2 })).toBe("reveal");
    expect(phaseOf({ ...base, currentRound: 5, status: "completed" })).toBe("finished");
    expect(phaseOf({ ...base, currentRound: 2, status: "abandoned" })).toBe("abandoned");
  });

  it("knows the highest possible total", () => {
    expect(maxTotal(base)).toBe(25_000);
  });
});
