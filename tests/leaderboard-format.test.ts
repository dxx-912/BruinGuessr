import { describe, expect, it } from "vitest";
import { ordinal } from "../src/lib/leaderboard";

describe("leaderboard helpers", () => {
  it("writes ordinals", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111, 112].map(ordinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st", "111th", "112th",
    ]);
  });
});
