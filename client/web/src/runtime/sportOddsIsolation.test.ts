import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("sport / esport UI isolation", () => {
  test("BetRow does not import sportOddsStore", () => {
    const src = readFileSync(join(root, "components/match/BetRow.vue"), "utf8");
    expect(src).not.toMatch(/from\s+["']@\/stores\/sportOddsStore["']/);
    expect(src).not.toMatch(/useSportOddsStore/);
  });

  test("BetRow reads getOdds via reactive Map without quoteTick fan-out", () => {
    const src = readFileSync(join(root, "components/match/BetRow.vue"), "utf8");
    expect(src).not.toMatch(/void oddsStore\.foRevision/);
    expect(src).not.toMatch(/void oddsStore\.quoteTick/);
    expect(src).not.toMatch(/void oddsStore\.liveQuoteTick/);
    expect(src).toMatch(/oddsStore\.getOdds/);
  });

  test("BetRow live timer is local — no matchStore.liveTick fan-out", () => {
    const row = readFileSync(join(root, "components/match/BetRow.vue"), "utf8");
    const store = readFileSync(join(root, "stores/matchStore.ts"), "utf8");
    expect(row).not.toMatch(/liveTick/);
    expect(row).toMatch(/liveClockTick/);
    expect(store).not.toMatch(/liveTick/);
    expect(store).not.toMatch(/startLiveClock/);
  });

  test("OrderList live price watches only order tokens — no global quoteTick", () => {
    const src = readFileSync(join(root, "components/order/OrderList.vue"), "utf8");
    const odds = readFileSync(join(root, "stores/oddsStore.ts"), "utf8");
    expect(src).toMatch(/orderLiveTick/);
    expect(src).toMatch(/watchedLiveTokens/);
    expect(src).toMatch(/\$onAction/);
    expect(src).not.toMatch(/storeToRefs\(\s*oddsStore\s*\)/);
    expect(src).not.toMatch(/void quoteTick/);
    expect(src).not.toMatch(/void sportOddsTick/);
    expect(src).toMatch(/pmShowLiveOdds/);
    expect(odds).not.toMatch(/quoteTick:\s*0/);
    expect(odds).not.toMatch(/bumpQuoteTick\s*\(/);
  });

  test("SportMatchBoard owns sportOddsStore and passes oddsDisplayTick", () => {
    const src = readFileSync(join(root, "components/match/SportMatchBoard.vue"), "utf8");
    expect(src).toMatch(/useSportOddsStore/);
    expect(src).toMatch(/odds-display-tick/);
    expect(src).toMatch(/:allow-betting="false"/);
  });

  test("sportLiveOdds clears sportOdds and listens for hub rebound", () => {
    const src = readFileSync(join(root, "runtime/sportLiveOdds.ts"), "utf8");
    expect(src).toMatch(/sportOdds\.clear\(\)/);
    expect(src).toMatch(/ensurePolymarketSportMarketConnection/);
    expect(src).toMatch(/clearPolymarketSportHub/);
    expect(src).toMatch(/onPolymarketSportHubBound/);
    expect(src).toMatch(/onPredictFunSportHubBound/);
  });

  test("sportLiveOdds does not import fo / saveVenueOdds", () => {
    const src = readFileSync(join(root, "runtime/sportLiveOdds.ts"), "utf8");
    expect(src).not.toMatch(/from\s+["']@\/stores\/oddsStore["']/);
    expect(src).not.toMatch(/useOddsStore/);
    expect(src).not.toMatch(/from\s+["'][^"']*oddsAccess["']/);
  });

  test("sportLiveOdds / SportMatchBoard do not import venue collect modules", () => {
    const live = readFileSync(join(root, "runtime/sportLiveOdds.ts"), "utf8");
    const board = readFileSync(join(root, "components/match/SportMatchBoard.vue"), "utf8");
    for (const src of [live, board]) {
      expect(src).not.toMatch(/polymarket\/collect/);
      expect(src).not.toMatch(/predictfun\/collect/);
      expect(src).not.toMatch(/startPolymarketCollector/);
      expect(src).not.toMatch(/startPredictFunCollector/);
      expect(src).not.toMatch(/saveTokenQuote/);
    }
  });

  test("BetRow gates arb/EV extensions when allowBetting is false", () => {
    const src = readFileSync(join(root, "components/match/BetRow.vue"), "utf8");
    expect(src).toMatch(/extensionsEnabled/);
    expect(src).toMatch(/betRowUiEnabled\.value && bettingEnabled\.value/);
  });

  test("MatchCard / BetRow default allowBetting true (Vue boolean cast gotcha)", () => {
    const card = readFileSync(join(root, "components/match/MatchCard.vue"), "utf8");
    const row = readFileSync(join(root, "components/match/BetRow.vue"), "utf8");
    expect(card).toMatch(/allowBetting:\s*true/);
    expect(row).toMatch(/allowBetting:\s*true/);
  });
});
