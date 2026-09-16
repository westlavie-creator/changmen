import { describe, expect, it } from "vitest";
import { parsePastedAccountCredential } from "./accountCredentialParse";

describe("parsePastedAccountCredential Stake", () => {
  it("maps plugin GetConfig payload token", () => {
    const raw = JSON.stringify({
      provider: "Stake",
      gateway: "https://stake.com",
      token: "sess-from-cookie",
      referer: "https://stake.com/sports/home",
    });
    expect(parsePastedAccountCredential(raw)).toMatchObject({
      provider: "Stake",
      token: "sess-from-cookie",
      gateway: "https://stake.com",
    });
  });

  it("maps accessToken when token is missing", () => {
    const raw = JSON.stringify({
      provider: "Stake",
      gateway: "https://stake.com",
      accessToken: "ws-session",
    });
    expect(parsePastedAccountCredential(raw)?.token).toBe("ws-session");
  });

  it("decodes plugin data base64 payload", () => {
    const payload = {
      provider: "Stake",
      gateway: "https://stake.com",
      token: "sess",
      referer: "https://stake.com/sports/rainbow-six",
    };
    const data = btoa(JSON.stringify(payload));
    expect(parsePastedAccountCredential(data)).toMatchObject({
      provider: "Stake",
      token: "sess",
    });
  });
});
