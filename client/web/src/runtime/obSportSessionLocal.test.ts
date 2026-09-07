import { afterEach, describe, expect, it } from "vitest";
import {
  looksLikeEsportObCollect,
  looksLikeSportObCollect,
  parseSportObSessionInput,
  SPORT_OB_SESSION_STORAGE_KEY,
  writeLocalSportObSession,
  readLocalSportObSession,
  clearLocalSportObSession,
} from "@/runtime/obSportSessionLocal";

describe("obSportSessionLocal", () => {
  afterEach(() => {
    clearLocalSportObSession();
  });

  it("rejects esport collect blobs", () => {
    const esport = {
      provider: "OB",
      gateway: ["https://api-esport.example.com"],
      token: "1234567890123456789",
      referer: "https://dj-pc.example.com/",
    };
    expect(looksLikeEsportObCollect(esport)).toBe(true);
    expect(looksLikeSportObCollect(esport)).toBe(false);
    expect(parseSportObSessionInput(esport).ok).toBe(false);
  });

  it("accepts kind=sport hex token and keeps it in localStorage only", () => {
    const sport = {
      provider: "OB",
      kind: "sport",
      gateway: ["https://api.937kddt.com"],
      token: "3d2d98226690510f2575b5d4c7a2de26f9b5e666",
      sessionId: "53595220421405155817865073474811",
    };
    expect(parseSportObSessionInput(sport).ok).toBe(true);
    writeLocalSportObSession({
      kind: "sport",
      token: sport.token,
      sessionId: sport.sessionId,
      gateway: "https://api.937kddt.com",
    });
    expect(readLocalSportObSession()?.token).toBe(sport.token);
    expect(localStorage.getItem(SPORT_OB_SESSION_STORAGE_KEY)).toContain("sport");
  });

  it("accepts wrapped base64 plugin data", () => {
    const payload = {
      provider: "OB",
      kind: "sport",
      gateway: ["https://api.jpbfa750.com"],
      token: "107491c69123e556f0817167dbab6b59e06116be",
      sessionId: "53660752045779641317887613834871",
    };
    const b64 = btoa(JSON.stringify(payload));
    const wrapped = `${b64.slice(0, 40)}\n${b64.slice(40)}`;
    const parsed = parseSportObSessionInput(wrapped);
    expect(parsed.ok).toBe(true);
    if (parsed.ok)
      expect(parsed.session.gateway).toBe("https://api.jpbfa750.com");
  });

  it("accepts sport iframe URL with token+api+sessionId", () => {
    const href = "https://user-pc-new.janbo0931.com/?token=107491c69123e556f0817167dbab6b59e06116be&gr=s&api=LmWT72%2B3VBELiJYsLXHnzvTeX%2B724kZsq57D7E%2Bvv0s%3D&sessionId=53660752045779641317887613834871";
    const parsed = parseSportObSessionInput(href);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.session.token).toBe("107491c69123e556f0817167dbab6b59e06116be");
      expect(parsed.session.sessionId).toBe("53660752045779641317887613834871");
    }
  });
});
