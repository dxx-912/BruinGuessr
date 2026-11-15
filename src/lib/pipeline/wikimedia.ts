/** Pure helpers for the Wikimedia Commons import. Kept separate so they can be unit tested. */

export type AcceptedLicense = { name: string; url: string | null };

/**
 * SPEC.md accepts only CC0, CC BY and CC BY-SA. Commons reports a machine-readable
 * license code such as "cc0", "cc-by-4.0" or "cc-by-sa-3.0"; anything else
 * (public domain claims, GFDL-only, non-commercial, no-derivatives) is refused.
 */
export function acceptedLicense(code: string | undefined, shortName?: string, url?: string): AcceptedLicense | null {
  if (!code) return null;
  const c = code.trim().toLowerCase();
  if (/-(nc|nd)\b/.test(c)) return null;
  if (c === "cc0" || c === "cc-zero") {
    return { name: "CC0 1.0", url: url || "https://creativecommons.org/publicdomain/zero/1.0/" };
  }
  const m = c.match(/^cc-by(-sa)?-(\d\.\d)(-[a-z]{2,})?$/);
  if (!m) return null;
  const name = shortName?.trim() || `CC BY${m[1] ? "-SA" : ""} ${m[2]}`;
  const fallback = `https://creativecommons.org/licenses/by${m[1] ? "-sa" : ""}/${m[2]}/`;
  return { name, url: url || fallback };
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", "#160": " " };

/** Commons stores the author as an HTML snippet. Returns plain text suitable for a credit line. */
export function plainCredit(html: string | undefined, fallback: string): string {
  if (!html) return fallback;
  const text = html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#?\w+);/g, (whole, name: string) => ENTITIES[name] ?? whole)
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return fallback;
  return text.length > 80 ? `${text.slice(0, 77).trimEnd()}…` : text;
}

/** Best guess at when the photo was taken, as an ISO string. Commons dates are free text. */
export function captureDate(dateTimeOriginal: string | undefined, uploaded: string | undefined): string | null {
  for (const raw of [dateTimeOriginal, uploaded]) {
    if (!raw) continue;
    const m = raw.replace(/<[^>]+>/g, " ").match(/(\d{4})[-:/](\d{2})[-:/](\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?/);
    if (!m) continue;
    const [, y, mo, d, h = "12", mi = "00", s = "00"] = m;
    const date = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`);
    if (!Number.isNaN(date.getTime()) && +y >= 1990 && date.getTime() <= Date.now()) return date.toISOString();
  }
  return null;
}
