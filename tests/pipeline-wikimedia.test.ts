import { describe, expect, it } from "vitest";
import { parseNumbers } from "../scripts/pipeline/decide";
import { acceptedLicense, captureDate, plainCredit } from "../src/lib/pipeline/wikimedia";

describe("acceptedLicense", () => {
  it("accepts CC0, CC BY and CC BY-SA in any version", () => {
    expect(acceptedLicense("cc0")?.name).toBe("CC0 1.0");
    expect(acceptedLicense("cc-by-4.0", "CC BY 4.0")?.name).toBe("CC BY 4.0");
    expect(acceptedLicense("cc-by-sa-3.0", "CC BY-SA 3.0")?.name).toBe("CC BY-SA 3.0");
    expect(acceptedLicense("cc-by-2.0")?.name).toBe("CC BY 2.0");
    expect(acceptedLicense("CC-BY-SA-4.0")?.name).toBe("CC BY-SA 4.0");
    expect(acceptedLicense("cc-by-sa-3.0-de")?.name).toBe("CC BY-SA 3.0");
  });

  it("refuses everything else", () => {
    for (const code of [undefined, "", "pd", "gfdl", "cc-by-nc-2.0", "cc-by-nc-sa-4.0", "cc-by-nd-2.0", "fal", "attribution", "copyrighted free use"]) {
      expect(acceptedLicense(code)).toBeNull();
    }
  });

  it("uses the license URL from Commons, or builds the standard one", () => {
    expect(acceptedLicense("cc-by-sa-4.0", "CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0")?.url).toBe(
      "https://creativecommons.org/licenses/by-sa/4.0",
    );
    expect(acceptedLicense("cc-by-2.0")?.url).toBe("https://creativecommons.org/licenses/by/2.0/");
    expect(acceptedLicense("cc0")?.url).toBe("https://creativecommons.org/publicdomain/zero/1.0/");
  });
});

describe("plainCredit", () => {
  it("strips the HTML Commons wraps authors in", () => {
    expect(plainCredit('<a href="//commons.wikimedia.org/wiki/User:Example" title="User:Example">Example</a>', "x")).toBe("Example");
    expect(plainCredit("Jane Doe &amp; friends", "x")).toBe("Jane Doe & friends");
    expect(plainCredit("<span>  Spaced\n  Out </span>", "x")).toBe("Spaced Out");
  });

  it("never lets script or style content through", () => {
    expect(plainCredit("<script>alert(1)</script>Real Name", "x")).toBe("Real Name");
  });

  it("falls back when there is nothing usable", () => {
    expect(plainCredit(undefined, "Uploader")).toBe("Uploader");
    expect(plainCredit("<br/>", "Uploader")).toBe("Uploader");
  });

  it("keeps credits to a displayable length", () => {
    expect(plainCredit("A".repeat(300), "x").length).toBeLessThanOrEqual(80);
  });
});

describe("captureDate", () => {
  it("reads EXIF-style and ISO dates", () => {
    expect(captureDate("2019:05:04 13:20:11", undefined)).toBe("2019-05-04T13:20:11.000Z");
    expect(captureDate("2021-10-02", undefined)).toBe("2021-10-02T12:00:00.000Z");
    expect(captureDate("<time>2016-03-09 08:00:00</time>", undefined)).toBe("2016-03-09T08:00:00.000Z");
  });

  it("falls back to the upload time", () => {
    expect(captureDate("sometime in spring", "2014-06-01T10:00:00Z")).toBe("2014-06-01T10:00:00.000Z");
  });

  it("gives up on nonsense rather than inventing a date", () => {
    expect(captureDate("0000:00:00 00:00:00", undefined)).toBeNull();
    expect(captureDate("2999-01-01", undefined)).toBeNull();
    expect(captureDate(undefined, undefined)).toBeNull();
  });
});

describe("parseNumbers (contact sheet picks)", () => {
  it("reads single numbers and ranges", () => {
    expect(parseNumbers("3,7,10-12")).toEqual([3, 7, 10, 11, 12]);
    expect(parseNumbers(" 5 ")).toEqual([5]);
  });

  it("rejects anything it cannot read", () => {
    expect(() => parseNumbers("3,x")).toThrow();
    expect(() => parseNumbers("9-4")).toThrow();
  });
});
