import { describe, expect, it } from "vitest";
import { formatDay, placeLabel } from "../src/lib/profile";

describe("profile formatting", () => {
  it("reads a versus finish", () => {
    expect(placeLabel(1, 4)).toBe("Won");
    expect(placeLabel(2, 4)).toBe("2nd of 4");
    expect(placeLabel(3, 5)).toBe("3rd of 5");
  });

  it("dates in campus time", () => {
    // 2026-11-18 06:30 UTC is still the 17th in Los Angeles.
    expect(formatDay(Date.UTC(2026, 10, 18, 6, 30))).toBe("Nov 17, 2026");
  });
});
