/**
 * Username rules shared by the form (instant feedback) and the server (the
 * real check). The profanity filter and the "taken" check run only on the
 * server, in src/lib/server/username.ts.
 */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 16;
const ALLOWED = /^[A-Za-z0-9_]+$/;

export type UsernameProblem =
  | "too_short"
  | "too_long"
  | "bad_chars"
  | "not_allowed"
  | "taken"
  | "locked";

export const USERNAME_MESSAGES: Record<UsernameProblem, string> = {
  too_short: `At least ${USERNAME_MIN} characters.`,
  too_long: `At most ${USERNAME_MAX} characters.`,
  bad_chars: "Letters, numbers and underscores only.",
  not_allowed: "That name isn't allowed. Try another.",
  taken: "Someone already has that name.",
  locked: "You already picked a username.",
};

/** Problems that can be spotted without asking the server. */
export function usernameFormatProblem(name: string): UsernameProblem | null {
  if (name.length < USERNAME_MIN) return "too_short";
  if (name.length > USERNAME_MAX) return "too_long";
  if (!ALLOWED.test(name)) return "bad_chars";
  return null;
}

/** A first guess at a username from the Google account name, e.g. "Joe Bruin" → "JoeBruin". */
export function suggestUsername(fullName: string | null): string {
  if (!fullName) return "";
  const cleaned = fullName
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/\s+/)
    .map((part) => part.replace(/[^A-Za-z0-9]/g, ""))
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join("")
    .slice(0, USERNAME_MAX);
  return cleaned.length >= USERNAME_MIN ? cleaned : "";
}
