import { describe, expect, it } from "vitest";
import {
  assertObSportAccountBinding,
  parseObSportUserInfo,
} from "@/runtime/obSportUserInfo";

describe("obSportUserInfo", () => {
  const sport = {
    venueMemberId: "537121917981379348",
    venueAccountName: "shihujingyuan22",
  };

  it("parses the official getUserInfoPB member identity", () => {
    expect(parseObSportUserInfo({
      userId: sport.venueMemberId,
      userName: sport.venueAccountName,
      nickName: sport.venueAccountName,
    })).toEqual(sport);
  });

  it("accepts the same esport and sport member account ignoring case", () => {
    expect(() => assertObSportAccountBinding({
      expectedVenueMemberId: sport.venueMemberId,
      esportVenueAccountName: "ShiHuJingYuan22",
      hasEsportCredential: true,
      sport,
    })).not.toThrow();
  });

  it("rejects a sport credential belonging to another member account", () => {
    expect(() => assertObSportAccountBinding({
      expectedVenueMemberId: sport.venueMemberId,
      esportVenueAccountName: "another-user",
      hasEsportCredential: true,
      sport,
    })).toThrow(/与电竞会员账号 another-user 不一致/);
  });

  it("does not guess identity when the esport member account is missing", () => {
    expect(() => assertObSportAccountBinding({
      hasEsportCredential: true,
      sport,
    })).toThrow(/电竞会员账号缺失/);
  });

  it("rejects a pasted UID that differs from the official profile", () => {
    expect(() => assertObSportAccountBinding({
      expectedVenueMemberId: "1009328104483790848",
      sport,
    })).toThrow(/体育会员 UID 不一致/);
  });
});
