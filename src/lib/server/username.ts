import "server-only";
import { englishDataset, englishRecommendedTransformers, RegExpMatcher } from "obscenity";
import { usernameFormatProblem, type UsernameProblem } from "@/lib/username";

/**
 * The basic profanity filter. `obscenity` catches common spellings and
 * look-alikes ("sh1t", "fuuuck") without flagging innocent words that contain
 * a bad one ("assassin", "Scunthorpe"). Names are checked as typed and with the
 * underscores taken out, so "f_u_c_k" is caught too.
 */
const matcher = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });

/**
 * Names that would look official or confuse other players. Compared ignoring
 * case, underscores and digits, so "Admin_1" and "BruinGuessr99" are caught.
 */
const RESERVED = new Set([
  "admin",
  "administrator",
  "mod",
  "moderator",
  "staff",
  "support",
  "official",
  "system",
  "root",
  "bruinguessr",
  "ucla",
  "uclaofficial",
  "joebruin",
  "josiebruin",
  "you",
  "me",
  "player",
  "guest",
  "anonymous",
  "null",
  "undefined",
  "deleted",
]);

export function isOffensive(name: string): boolean {
  return matcher.hasMatch(name) || matcher.hasMatch(name.replace(/_/g, ""));
}

export function isReserved(name: string): boolean {
  return RESERVED.has(name.toLowerCase().replace(/[_\d]/g, ""));
}

/** Everything that can be checked without the database. */
export function usernameProblem(name: string): UsernameProblem | null {
  return usernameFormatProblem(name) ?? (isOffensive(name) || isReserved(name) ? "not_allowed" : null);
}
