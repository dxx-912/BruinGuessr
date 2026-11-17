import { beforeAll, describe, expect, it } from "vitest";

let guest: typeof import("../src/lib/server/guest");
beforeAll(async () => {
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "unit-test-key";
  guest = await import("../src/lib/server/guest");
});

const req = (headers: Record<string, string>) => new Request("http://localhost/api/games", { headers });

describe("guest networks", () => {
  it("uses the address Vercel reports, the first one when there are several", () => {
    expect(guest.clientIp(req({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1" }))).toBe("203.0.113.7");
    expect(guest.clientIp(req({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" }))).toBe("198.51.100.1");
    expect(guest.clientIp(req({}))).toBe("local");
  });

  it("stores only a keyed hash of the address", () => {
    const hash = guest.networkHash(req({ "x-real-ip": "203.0.113.7" }));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain("203");
    expect(guest.networkHash(req({ "x-real-ip": "203.0.113.7" }))).toBe(hash);
    expect(guest.networkHash(req({ "x-real-ip": "203.0.113.8" }))).not.toBe(hash);
  });
});
