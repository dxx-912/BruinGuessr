import { describe, expect, it } from "vitest";
import { isOffensive, isReserved, usernameProblem } from "../src/lib/server/username";
import { suggestUsername, usernameFormatProblem } from "../src/lib/username";

describe("username format", () => {
  it("accepts 3 to 16 letters, digits and underscores", () => {
    for (const ok of ["abc", "Joe_Bruin", "bruin2027", "A".repeat(16)]) expect(usernameFormatProblem(ok)).toBeNull();
  });
  it("names the problem otherwise", () => {
    expect(usernameFormatProblem("ab")).toBe("too_short");
    expect(usernameFormatProblem("A".repeat(17))).toBe("too_long");
    expect(usernameFormatProblem("joe bruin")).toBe("bad_chars");
    expect(usernameFormatProblem("joé")).toBe("bad_chars");
    expect(usernameFormatProblem("joe.bruin")).toBe("bad_chars");
  });
});

describe("profanity filter", () => {
  it("catches obvious and disguised profanity", () => {
    for (const bad of ["fuck", "Fuuuck", "sh1thead", "fvck_this", "f_u_c_k", "BigD1ck"]) expect(isOffensive(bad), bad).toBe(true);
  });
  it("leaves innocent names that contain a bad word alone", () => {
    for (const fine of ["assassin", "class_of_2027", "scunthorpe", "cocktail", "bass_player", "analyst", "titanic", "RoyceHall22"]) {
      expect(isOffensive(fine), fine).toBe(false);
    }
  });
  it("reserves official-looking names, ignoring case, digits and underscores", () => {
    for (const name of ["admin", "Admin_1", "BruinGuessr99", "UCLA", "mod_"]) expect(isReserved(name), name).toBe(true);
    expect(isReserved("adminton")).toBe(false);
  });
  it("reports either as not allowed", () => {
    expect(usernameProblem("sh1thead")).toBe("not_allowed");
    expect(usernameProblem("Moderator")).toBe("not_allowed");
    expect(usernameProblem("RoyceHall22")).toBeNull();
    expect(usernameProblem("JoeBruin")).toBe("not_allowed");
  });
});

describe("username suggestion", () => {
  it("builds one from the Google name", () => {
    expect(suggestUsername("Joe Bruin")).toBe("JoeBruin");
    expect(suggestUsername("josé de la cruz")).toBe("JoseDeLaCruz");
    expect(suggestUsername("Bartholomew Montgomery-Smith")).toBe("BartholomewMontg");
  });
  it("gives nothing when there is nothing usable", () => {
    expect(suggestUsername(null)).toBe("");
    expect(suggestUsername("李")).toBe("");
    expect(suggestUsername("Al")).toBe("");
  });
});
