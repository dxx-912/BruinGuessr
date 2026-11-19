/**
 * The credits page: who took the photos in the game, and under which license.
 * It works from names and licenses only. Nothing here says which photo is
 * whose or where it was taken, because that would give answers away.
 */

export type PhotoSource = "mapillary" | "wikimedia" | "original" | "community";

/** One photo's credit, as the images table holds it. */
export type CreditRow = { source: PhotoSource; photographer: string; license: string; license_url: string | null };

export type License = { name: string; fullName: string; url: string | null };
export type Photographer = { name: string; licenses: License[] };
export type CreditGroup = { source: PhotoSource; photographers: Photographer[] };

const SOURCE_ORDER: PhotoSource[] = ["community", "mapillary", "wikimedia", "original"];

/** "CC BY-SA 4.0" → "Creative Commons Attribution-ShareAlike 4.0". Unknown names are returned as they are. */
export function licenseFullName(license: string): string {
  const name = license.trim();
  const zero = /^CC0(?:\s+(\d+(?:\.\d+)?))?$/i.exec(name);
  if (zero) return `Creative Commons Zero ${zero[1] ?? "1.0"} (public domain dedication)`;
  const cc = /^CC[\s-]BY(-SA)?\s+(\d+(?:\.\d+)?)$/i.exec(name);
  if (cc) return `Creative Commons Attribution${cc[1] ? "-ShareAlike" : ""} ${cc[2]}`;
  return name;
}

/** The license's own page, if it is a secure Creative Commons address. Anything else is left out rather than linked. */
export function licenseLink(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url.trim().replace(/^http:\/\//i, "https://"));
    return parsed.protocol === "https:" && parsed.hostname === "creativecommons.org" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

const byName = (a: string, b: string) => a.localeCompare(b, "en", { sensitivity: "base" });

/** Photographers by source, each with the licenses their photos carry, in alphabetical order. */
export function groupCredits(rows: CreditRow[]): CreditGroup[] {
  const groups = new Map<PhotoSource, Map<string, Map<string, License>>>();
  for (const row of rows) {
    const name = row.photographer.trim();
    const license = row.license.trim();
    if (!name || !license) continue;
    const people = groups.get(row.source) ?? new Map<string, Map<string, License>>();
    groups.set(row.source, people);
    const licenses = people.get(name) ?? new Map<string, License>();
    people.set(name, licenses);
    if (!licenses.has(license)) licenses.set(license, { name: license, fullName: licenseFullName(license), url: licenseLink(row.license_url) });
  }
  return SOURCE_ORDER.flatMap((source) => {
    const people = groups.get(source);
    if (!people) return [];
    const photographers = [...people.entries()]
      .map(([name, licenses]) => ({ name, licenses: [...licenses.values()].sort((a, b) => byName(a.name, b.name)) }))
      .sort((a, b) => byName(a.name, b.name));
    return [{ source, photographers }];
  });
}
