import { describe, expect, it } from "vitest";
import {
  isObSportBetToken,
  pickObSportBetAccount,
  sportObSessionFromAccount,
} from "@/runtime/obSportBetAccount";

describe("obSportBetAccount", () => {
  it("accepts panda sport hex tokens and rejects esport numeric tokens", () => {
    expect(isObSportBetToken("e9734a4d633b350be25b428556622ca2f161b633")).toBe(true);
    expect(isObSportBetToken("1234567890123456789")).toBe(false);
    expect(isObSportBetToken("")).toBe(false);
  });

  it("builds a sport session from an OB betting account", () => {
    expect(sportObSessionFromAccount({
      provider: "RAY",
      token: "e9734a4d633b350be25b428556622ca2f161b633",
    })).toBeNull();
    expect(sportObSessionFromAccount({
      provider: "OB",
      token: "1234567890123456789",
    })).toBeNull();
    const session = sportObSessionFromAccount({
      provider: "OB",
      token: "e9734a4d633b350be25b428556622ca2f161b633",
      gateway: "https://api.jpbfa750.com/",
      referer: "https://user-pc-new.dbgaming.com/",
      venueMemberId: "53660752045779641317887613834871",
    });
    expect(session?.token).toBe("e9734a4d633b350be25b428556622ca2f161b633");
    expect(session?.gateway).toBe("https://api.jpbfa750.com");
    expect(session?.sessionId).toBe("53660752045779641317887613834871");
  });

  it("picks the active unpaused OB sport account", () => {
    const esport = { provider: "OB", token: "1234567890123456789", active: true };
    const paused = {
      provider: "OB",
      token: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      pause: true,
    };
    const idle = {
      provider: "OB",
      token: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    };
    const active = {
      provider: "OB",
      token: "cccccccccccccccccccccccccccccccccccccccc",
      active: true,
    };
    expect(pickObSportBetAccount([esport, paused, idle, active])).toEqual(active);
    expect(pickObSportBetAccount([esport, paused, idle])).toEqual(idle);
    expect(pickObSportBetAccount([esport, paused])).toBeNull();
  });
});
