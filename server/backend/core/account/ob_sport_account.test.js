import { describe, expect, it } from "vitest";
import {
  isObEsportToken,
  isObSportBetToken,
  mergeSportObPatch,
  preserveSportObOnAccountSave,
} from "./ob_sport_account.js";

const HEX = "e9734a4d633b350be25b428556622ca2f161b633";
const ESPORT = "1234567890123456789";

describe("ob_sport_account", () => {
  it("distinguishes panda hex from esport numeric tokens", () => {
    expect(isObSportBetToken(HEX)).toBe(true);
    expect(isObSportBetToken(ESPORT)).toBe(false);
    expect(isObEsportToken(ESPORT)).toBe(true);
    expect(isObEsportToken(HEX)).toBe(false);
  });

  it("ACCOUNT save keeps stored sportOb and ignores client sportOb", () => {
    const out = preserveSportObOnAccountSave(
      { token: ESPORT, sportOb: { token: "deadbeefdeadbeefdeadbeefdeadbeef" } },
      { token: ESPORT, sportOb: { token: HEX, gateway: "https://api.sport.example" } },
    );
    expect(out.token).toBe(ESPORT);
    expect(out.sportOb).toEqual({ token: HEX, gateway: "https://api.sport.example" });
  });

  it("ACCOUNT save does not let hex overwrite an esport token", () => {
    const out = preserveSportObOnAccountSave(
      { token: HEX, gateway: "https://api.sport.example" },
      { token: ESPORT, sportOb: { token: HEX } },
    );
    expect(out.token).toBe(ESPORT);
    expect(out.sportOb.token).toBe(HEX);
  });

  it("ACCOUNT save migrates legacy hex-in-token into sportOb", () => {
    const out = preserveSportObOnAccountSave(
      { token: HEX, gateway: "https://api.sport.example/" },
      { token: HEX, gateway: "https://api.sport.example/" },
    );
    expect(out.token).toBe("");
    expect(out.sportOb.token).toBe(HEX);
    expect(out.sportOb.gateway).toBe("https://api.sport.example");
  });

  it("ACCOUNT save migrates cleared hex token instead of dropping it", () => {
    const out = preserveSportObOnAccountSave(
      { token: "" },
      { token: HEX, gateway: "https://api.sport.example/" },
    );
    expect(out.token).toBe("");
    expect(out.sportOb.token).toBe(HEX);
    expect(out.sportOb.gateway).toBe("https://api.sport.example");
  });

  it("ACCOUNT empty token still logs out esport and keeps sportOb", () => {
    const out = preserveSportObOnAccountSave(
      { token: "" },
      { token: ESPORT, sportOb: { token: HEX } },
    );
    expect(out.token).toBe("");
    expect(out.sportOb.token).toBe(HEX);
  });

  it("mergeSportObPatch upserts without dropping sibling keys", () => {
    expect(mergeSportObPatch(
      { token: HEX, gateway: "https://a.example" },
      { referer: "https://user.example" },
    )).toEqual({
      token: HEX,
      gateway: "https://a.example",
      referer: "https://user.example",
    });
    expect(mergeSportObPatch({ token: HEX }, { token: "" })).toEqual({ token: HEX });
  });
});
