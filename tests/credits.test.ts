import { describe, expect, it } from "vitest";
import { groupCredits, licenseFullName, licenseLink, type CreditRow } from "@/lib/credits";
import { inAppBrowser } from "@/lib/in-app-browser";

const row = (source: CreditRow["source"], photographer: string, license: string, license_url: string | null = null): CreditRow => ({ source, photographer, license, license_url });

describe("credits page", () => {
  it("groups photographers by source, alphabetically, one entry each", () => {
    const groups = groupCredits([
      row("wikimedia", "Zed", "CC BY-SA 4.0"),
      row("mapillary", "bob", "CC BY-SA 4.0"),
      row("mapillary", "Alice", "CC BY-SA 4.0"),
      row("mapillary", "bob", "CC BY-SA 4.0"),
      row("wikimedia", "Zed", "CC0 1.0"),
    ]);
    expect(groups.map((g) => g.source)).toEqual(["mapillary", "wikimedia"]);
    expect(groups[0].photographers.map((p) => p.name)).toEqual(["Alice", "bob"]);
    expect(groups[1].photographers[0].licenses.map((l) => l.name)).toEqual(["CC BY-SA 4.0", "CC0 1.0"]);
  });

  it("carries nothing but names and licenses", () => {
    const [group] = groupCredits([row("mapillary", "bob", "CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0/")]);
    expect(Object.keys(group.photographers[0]).sort()).toEqual(["licenses", "name"]);
    expect(Object.keys(group.photographers[0].licenses[0]).sort()).toEqual(["fullName", "name", "url"]);
  });

  it("spells out license names", () => {
    expect(licenseFullName("CC BY-SA 4.0")).toBe("Creative Commons Attribution-ShareAlike 4.0");
    expect(licenseFullName("CC BY 2.0")).toBe("Creative Commons Attribution 2.0");
    expect(licenseFullName("CC0 1.0")).toBe("Creative Commons Zero 1.0 (public domain dedication)");
    expect(licenseFullName("Something else")).toBe("Something else");
  });

  it("links only to secure Creative Commons pages, never to a photo's source", () => {
    expect(licenseLink("http://creativecommons.org/publicdomain/zero/1.0/deed.en")).toBe("https://creativecommons.org/publicdomain/zero/1.0/deed.en");
    expect(licenseLink("https://commons.wikimedia.org/wiki/File:Royce.jpg")).toBeNull();
    expect(licenseLink("javascript:alert(1)")).toBeNull();
    expect(licenseLink(null)).toBeNull();
  });
});

describe("in-app browsers", () => {
  const safari = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
  it("leaves real browsers alone", () => {
    expect(inAppBrowser(safari)).toBeNull();
    expect(inAppBrowser("Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36")).toBeNull();
  });
  it("names the app whose browser it is", () => {
    expect(inAppBrowser(`${safari} Instagram 350.0.0.0`)).toBe("Instagram");
    expect(inAppBrowser("Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Mobile/15E148 [FBAN/FBIOS;FBAV/480.0]")).toBe("Facebook");
    expect(inAppBrowser("Mozilla/5.0 (Linux; Android 15; Pixel 8; wv) AppleWebKit/537.36 Chrome/141.0.0.0 Mobile Safari/537.36")).toBe("this app");
  });
});
