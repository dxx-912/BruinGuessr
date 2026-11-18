import { describe, expect, it } from "vitest";
import { SHOWCASE_COUNT, showcaseBatch, showcasePicks } from "@/lib/server/showcase";

describe("showcase photos", () => {
  it("picks the same distinct photos for a batch, on any server", () => {
    const picks = showcasePicks(83100, 160);
    expect(picks).toEqual(showcasePicks(83100, 160));
    expect(picks).toHaveLength(SHOWCASE_COUNT);
    expect(new Set(picks).size).toBe(SHOWCASE_COUNT);
    for (const i of picks) expect(i >= 0 && i < 160).toBe(true);
  });

  it("changes the set from one batch to the next", () => {
    expect(showcasePicks(83101, 160)).not.toEqual(showcasePicks(83100, 160));
  });

  it("copes with a pool smaller than the stack", () => {
    expect(showcasePicks(1, 3).sort()).toEqual([0, 1, 2]);
    expect(showcasePicks(1, 0)).toEqual([]);
  });

  it("starts a new batch every six hours", () => {
    const sixHours = 6 * 60 * 60 * 1000;
    expect(showcaseBatch(sixHours * 10)).toBe(10);
    expect(showcaseBatch(sixHours * 11 - 1)).toBe(10);
  });
});
