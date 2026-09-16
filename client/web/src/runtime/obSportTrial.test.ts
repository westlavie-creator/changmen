import { describe, expect, it } from "vitest";
import {
  formatPandaSportTrialPaste,
  isObSportPcShellHost,
  PANDA_SPORT_TRIAL_GATEWAY,
  pandaSportTryPlayUrl,
  parsePandaSportTryPlay,
  resolveObSportHttpGateway,
} from "@/runtime/obSportTrial";
import { parseSportObSessionInput } from "@/runtime/obSportSessionLocal";

describe("obSportTrial", () => {
  const envelope = {
    code: "0000000",
    data: {
      loginUrl: "https://user-pc-new.dbgaming.com?token=e9734a4d633b350be25b428556622ca2f161b633&gr=common",
      domain: "https://user-pc-new.dbgaming.com",
      userName: "try_YXwxg5",
      lang: "zh",
      token: "e9734a4d633b350be25b428556622ca2f161b633",
    },
    msg: "成功",
    status: true,
  };

  it("parses official tryPlay envelope into paste JSON with gateway", () => {
    const row = parsePandaSportTryPlay(envelope);
    expect(row.kind).toBe("sport");
    expect(row.token).toBe("e9734a4d633b350be25b428556622ca2f161b633");
    expect(row.gateway).toEqual([PANDA_SPORT_TRIAL_GATEWAY]);
    expect(row.referer).toBe("https://user-pc-new.dbgaming.com/");
    expect(row.href).toContain("token=e9734a4d633b350be25b428556622ca2f161b633");
    const parsed = parseSportObSessionInput(formatPandaSportTrialPaste(row));
    expect(parsed.ok).toBe(true);
    if (parsed.ok)
      expect(parsed.session.gateway).toBe(PANDA_SPORT_TRIAL_GATEWAY);
  });

  it("rejects failed tryPlay codes", () => {
    expect(() => parsePandaSportTryPlay({ code: "0401013", msg: "人数过多", status: false })).toThrow(/人数过多/);
  });

  it("builds zh and en tryPlay URLs without mixing tokens", () => {
    expect(pandaSportTryPlayUrl("zh")).toContain("lang=zh");
    expect(pandaSportTryPlayUrl("en")).toContain("lang=en");
    expect(pandaSportTryPlayUrl()).toContain("lang=zh");
  });

  it("does not treat the official PC shell as an HTTP gateway", () => {
    expect(isObSportPcShellHost("https://user-pc-new.dbgaming.com")).toBe(true);
    expect(resolveObSportHttpGateway(
      "https://user-pc-new.dbgaming.com",
      "https://user-pc-new.dbgaming.com/",
    )).toBe(PANDA_SPORT_TRIAL_GATEWAY);
    expect(resolveObSportHttpGateway("https://api.jpbfa750.com")).toBe("https://api.jpbfa750.com");
    expect(resolveObSportHttpGateway("https://user-pc-new.janbo0931.com")).toBe("");
  });
});
