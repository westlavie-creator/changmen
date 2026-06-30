import { describe, expect, it } from "vitest";
import {
  computePolymarketSettlement,
  findPolymarketWinnerIndex,
  isPolymarketMarketResolved,
  clobMarketToGammaShape,
} from "./settlement.js";

const ilbirsMarket = {
  condition_id: "0xfaf8d69ad2f0677b6f987e7da1c94022f73073120e9ed28969fcf5153475116f",
  closed: false,
  outcomes: "[\"Ilbirs eSports\", \"BALU\"]",
  outcomePrices: "[\"0.9995\", \"0.0005\"]",
  clobTokenIds: "[\"12876938733604859423663202044051912631612545733461708116502231340403727260024\", \"64898223322413645971505217367611485629461864230905813190263318936513341854768\"]",
};

const ilbirsTrade = {
  asset_id: "12876938733604859423663202044051912631612545733461708116502231340403727260024",
  side: "BUY",
  size: "6.756753",
  price: "0.74",
  outcome: "Ilbirs eSports",
};

describe("polymarket settlement (server)", () => {
  it("resolves when closed=false but outcomePrices show winner", () => {
    expect(isPolymarketMarketResolved(ilbirsMarket)).toBe(true);
    expect(findPolymarketWinnerIndex([0.9995, 0.0005])).toBe(0);
    const out = computePolymarketSettlement(ilbirsTrade, ilbirsMarket, 5);
    expect(out).toMatchObject({ status: "win", money: 1.7568 });
  });

  it("keeps none for open market prices", () => {
    const open = { ...ilbirsMarket, outcomePrices: "[\"0.74\", \"0.26\"]" };
    expect(isPolymarketMarketResolved(open)).toBe(false);
    expect(computePolymarketSettlement(ilbirsTrade, open, 5).status).toBe("none");
  });

  it("settles from CLOB market tokens when Gamma shape missing", () => {
    const shaped = clobMarketToGammaShape({
      closed: true,
      condition_id: "0xabc",
      tokens: [
        { token_id: "12876938733604859423663202044051912631612545733461708116502231340403727260024", outcome: "Ilbirs eSports", price: 1, winner: true },
        { token_id: "64898223322413645971505217367611485629461864230905813190263318936513341854768", outcome: "BALU", price: 0, winner: false },
      ],
    });
    const out = computePolymarketSettlement(ilbirsTrade, shaped, 5);
    expect(out.status).toBe("win");
  });
});
