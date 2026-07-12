import { describe, expect, it } from "vitest";

import {
  buildVenueAccountKey,
  buildVenueAccountKeyFromRecord,
} from "./venue_account_key.js";

describe("venue_account_key", () => {
  it("prefers venue_member_id over credentials", () => {
    expect(buildVenueAccountKey({
      provider: "OB",
      venueMemberId: "610738",
      gateway: "https://x.com/",
      token: "abc",
    })).toBe("ob:member:610738");
  });

  it("hashes gateway+token when member id missing", () => {
    const a = buildVenueAccountKey({
      provider: "PB",
      gateway: "https://api.example.com/",
      token: "secret",
    });
    const b = buildVenueAccountKey({
      provider: "pb",
      gateway: "https://api.example.com",
      token: "secret",
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^pb:cred:[a-f0-9]{32}$/);
  });

  it("returns empty without provider or identifiers", () => {
    expect(buildVenueAccountKey({ provider: "OB" })).toBe("");
    expect(buildVenueAccountKeyFromRecord({ gateway: "x", token: "y" })).toBe("");
  });
});
