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
    expect(src).toMatch(/startObSportWs/);
    expect(src).toMatch(/onQuotes/);
    expect(src).toMatch(/saveMany/);
    expect(src).toMatch(/SPORT_OB_MID_CAP/);
    expect(src).toMatch(/flushPendingQuotes/);
    expect(src).toMatch(/SPORT_OB_SESSION_UPDATED/);
    expect(src).not.toMatch(/applyQuoteToMatches\(getMatches\(\),\s*OB/);
    expect(src).not.toMatch(/from\s+["']@changmen\/venue-adapter\/ob["']/);
    expect(src).not.toMatch(/ws-forward\/OB/);
  });

  test("sportLiveOdds does not import fo / saveVenueOdds", () => {
    const src = readFileSync(join(root, "runtime/sportLiveOdds.ts"), "utf8");
    expect(src).not.toMatch(/from\s+["']@\/stores\/oddsStore["']/);
    expect(src).not.toMatch(/useOddsStore/);
    expect(src).not.toMatch(/from\s+["'][^"']*oddsAccess["']/);
  });

  test("sportLiveOdds / sport boards do not import venue collect modules", () => {
    const live = readFileSync(join(root, "runtime/sportLiveOdds.ts"), "utf8");
    const board = readFileSync(join(root, "components/match/SportMatchBoard.vue"), "utf8");
    const football = readFileSync(join(root, "components/football/FootballMatchBoard.vue"), "utf8");
    for (const src of [live, board, football]) {
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

  test("esport HomeView is unchanged: MatchCard + matchStore + fo BetRow, no football board", () => {
    const home = readFileSync(join(root, "views/HomeView.vue"), "utf8");
    const card = readFileSync(join(root, "components/match/MatchCard.vue"), "utf8");
    const row = readFileSync(join(root, "components/match/BetRow.vue"), "utf8");
    const store = readFileSync(join(root, "stores/matchStore.ts"), "utf8");
    expect(home).toMatch(/from "@\/components\/match\/MatchCard\.vue"/);
    expect(home).toMatch(/<MatchCard v-for="m in filteredMatchs"/);
    expect(home).not.toMatch(/odds-display-tick/);
    expect(home).toMatch(/<DirectRealtimeBadge \/>/);
    expect(home).toMatch(/ActiveBetRunView/);
    expect(home).toMatch(/MakeupCalcBar/);
    expect(home).toMatch(/useMatchStore/);
    expect(home).not.toMatch(/FootballBoard|FootballMatchCard|FootballObExpand|useFootballStore|sportOddsStore/);
    expect(home).not.toMatch(/FootballSettingsDialog|show-football-settings|openFootballSettings/);
    expect(card).toMatch(/BetRow/);
    expect(card).toMatch(/v-html="match.title"/);
    expect(row).toMatch(/useOddsStore/);
    expect(row).not.toMatch(/itemDrawOdds/);
    expect(row).not.toMatch(/fallbackDrawOdds/);
    expect(store).toMatch(/getMatchs/);
    expect(store).not.toMatch(/getFootballMatchs/);
    expect(store).not.toMatch(/getFootballMatchMarkets/);
  });

  test("MatchCard / BetRow default allowBetting true (Vue boolean cast gotcha)", () => {
    const card = readFileSync(join(root, "components/match/MatchCard.vue"), "utf8");
    const row = readFileSync(join(root, "components/match/BetRow.vue"), "utf8");
    expect(card).toMatch(/allowBetting:\s*true/);
    expect(row).toMatch(/allowBetting:\s*true/);
    expect(card).not.toMatch(/hideBets/);
  });

  test("football board is independent of esport MatchCard / BetRow / MakeupCalc", () => {
    const board = readFileSync(join(root, "components/match/FootballBoard.vue"), "utf8");
    const list = readFileSync(join(root, "components/football/FootballMatchBoard.vue"), "utf8");
    const card = readFileSync(join(root, "components/football/FootballMatchCard.vue"), "utf8");
    const book = readFileSync(join(root, "components/football/FootballMarketBook.vue"), "utf8");
    const workspace = readFileSync(join(root, "views/SportsWorkspace.vue"), "utf8");
    const home = readFileSync(join(root, "views/HomeView.vue"), "utf8");
    const layout = readFileSync(join(root, "runtime/footballMarketLayout.ts"), "utf8");
    expect(board).toMatch(/FootballMatchBoard/);
    expect(board).not.toMatch(/SportMatchBoard/);
    expect(board).not.toMatch(/hide-bets/);
    expect(list).toMatch(/FootballMatchCard/);
    expect(list).toMatch(/FootballLazyBook/);
    expect(list).toMatch(/patchMatchFallback:\s*false/);
    expect(list).not.toMatch(/FootballMarketBook/);
    expect(list).toMatch(/useFootballStore/);
    expect(list).not.toMatch(/useSportOddsStore/);
    expect(list).not.toMatch(/oddsDisplayTick|odds-display-tick/);
    expect(book).not.toMatch(/useSportOddsStore/);
    expect(book).not.toMatch(/applyObLiveOdds/);
    expect(book).not.toMatch(/void liveTick/);
    expect(book).not.toMatch(/oddsDisplayTick/);
    expect(card).not.toMatch(/void liveTick/);
    expect(card).toMatch(/storeToRefs/);
    expect(list).toMatch(/listObFootballLivePatches/);
    expect(list).toMatch(/filterSportBoardMatches/);
    expect(list).toMatch(/搜索队名 \/ 联赛/);
    expect(list).not.toMatch(/@\/components\/match\/MatchCard/);
    expect(list).not.toMatch(/BetRow/);
    expect(list).not.toMatch(/MakeupCalcBar/);
    expect(card).not.toMatch(/BetRow/);
    expect(card).not.toMatch(/v-html/);
    expect(card).not.toMatch(/class="bets/);
    expect(card).not.toMatch(/pmSportDisplay/);
    expect(card).not.toMatch(/ESPORT_GAME_ICONS/);
    expect(workspace).not.toMatch(/ActiveBetRunView/);
    const panel = readFileSync(join(root, "components/user/UserInfoPanel.vue"), "utf8");
    expect(panel).toMatch(/showFootballSettings/);
    expect(panel).toMatch(/足球设置/);
    expect(panel).not.toMatch(/obSportFootballFetch|FootballObSessionBar/);
    expect(workspace).toMatch(/FootballSettingsDialog/);
    expect(workspace).toMatch(/PodAlertPanel/);
    expect(workspace).toMatch(/PodFollowPanel/);
    expect(workspace).toMatch(/show-football-settings/);
    const dropPanel = readFileSync(join(root, "components/football/PodAlertPanel.vue"), "utf8");
    expect(dropPanel).not.toMatch(/filterPodAlertsForBet|podBetSettings|PodFollowPanel/);
    const followPanel = readFileSync(join(root, "components/football/PodFollowPanel.vue"), "utf8");
    expect(followPanel).toMatch(/下注金额/);
    expect(followPanel).toMatch(/writePodBetSettings/);
    const settings = readFileSync(join(root, "components/football/FootballSettingsDialog.vue"), "utf8");
    expect(settings).toMatch(/el-tabs/);
    expect(settings).toMatch(/OB体育试玩/);
    expect(settings).toMatch(/fetchPandaSportTrialRow/);
    expect(settings).toMatch(/PodBetSettingsTab/);
    expect(settings).toMatch(/POD跟单/);
    expect(settings).not.toMatch(/USERCONFIG/);
    expect(settings).not.toMatch(/enterCreditPlate/);
    expect(settings).not.toMatch(/from ["']@\/api\/v4["']/);
    const podBet = readFileSync(join(root, "runtime/podBetSettings.ts"), "utf8");
    expect(podBet).toMatch(/changmen:podBetSettings/);
    expect(podBet).toMatch(/localStorage/);
    expect(podBet).not.toMatch(/Client_SaveData/);
    expect(podBet).not.toMatch(/from ["']@\/api\/v4["']/);
    expect(home).not.toMatch(/FootballObExpand/);
    expect(home).not.toMatch(/FootballMatchCard/);
    expect(home).not.toMatch(/FootballOddsCell/);
    expect(list).toMatch(/sportMatchStableKey/);
    expect(list).toMatch(/visibleMatchs/);
    expect(list).toMatch(/groupFootballMatchesByLeague/);
    expect(list).toMatch(/leagueFilter/);
    expect(card).toMatch(/footballLeagueTag/);
    expect(card).toMatch(/game-tag/);
    expect(card).not.toMatch(/showLeague/);
    expect(card).not.toMatch(/收起/);
    expect(book).toMatch(/loading && !columns.length/);
    expect(book).not.toMatch(/overflow-x:\s*auto/);
    expect(book).toMatch(/groupFootballColumns/);
    expect(book).toMatch(/mergeFootballBookRows/);
    expect(book).not.toMatch(/class="bet"/);
    expect(book).not.toMatch(/BetRow/);
    const lazy = readFileSync(join(root, "components/football/FootballLazyBook.vue"), "utf8");
    expect(lazy).toMatch(/IntersectionObserver/);
    expect(lazy).toMatch(/FootballMarketBook/);
    expect(lazy).not.toMatch(/BetRow/);
    expect(lazy).not.toMatch(/useOddsStore/);
    const section = readFileSync(join(root, "components/football/FootballMarketSection.vue"), "utf8");
    const cell = readFileSync(join(root, "components/football/FootballOddsCell.vue"), "utf8");
    expect(section).toMatch(/PlatformIcon/);
    expect(section).toMatch(/FootballOddsCell/);
    expect(section).not.toMatch(/BetRow/);
    expect(section).not.toMatch(/useOddsStore/);
    expect(section).not.toMatch(/useSportOddsStore/);
    expect(cell).toMatch(/useSportOddsStore/);
    expect(cell).toMatch(/resolveFootballCellOdds/);
    expect(cell).toMatch(/odds-src/);
    expect(cell).not.toMatch(/useOddsStore/);
    expect(cell).not.toMatch(/from\s+["']@\/stores\/oddsStore["']/);
    expect(cell).not.toMatch(/quoteTick|foRevision/);
    expect(layout).toMatch(/全场让球/);
    expect(layout).toMatch(/全场大小/);
    expect(layout).toMatch(/半场让球/);
    expect(layout).toMatch(/半场大小/);
    expect(layout).toMatch(/FOOTBALL_BOOK_COLUMNS/);
  });

  test("sports workspace shows OB-S status, not esport MQTT forward", () => {
    const badge = readFileSync(join(root, "components/layout/DirectRealtimeBadge.vue"), "utf8");
    const bar = readFileSync(join(root, "components/match/FootballObSessionBar.vue"), "utf8");
    const ws = readFileSync(join(root, "runtime/obSportWs.ts"), "utf8");
    expect(badge).toMatch(/ob-sport/);
    expect(badge).toMatch(/OB-S/);
    expect(bar).toMatch(/OB_SPORT_WS_ID/);
    expect(bar).toMatch(/WS 已连接/);
    expect(ws).toMatch(/reportVenueWsStatus/);
    expect(ws).toMatch(/buildObSportC8Subscribe/);
    expect(ws).toMatch(/new WebSocket/);
    expect(ws).toMatch(/yieldToPaint/);
    expect(ws).toMatch(/pumpIncoming/);
    expect(ws).not.toMatch(/a8PluginConnect/);
    expect(ws).not.toMatch(/ws-forward\/OB/);
    expect(ws).not.toMatch(/from\s+["']@changmen\/venue-adapter\/ob["']/);
  });

  test("football OB HTTP stays on the page like esport, not VPS session APIs", () => {
    const fetchSrc = readFileSync(join(root, "runtime/obSportFootballFetch.ts"), "utf8");
    const markets = readFileSync(join(root, "runtime/footballObMarkets.ts"), "utf8");
    const bar = readFileSync(join(root, "components/match/FootballObSessionBar.vue"), "utf8");
    const live = readFileSync(join(root, "runtime/sportLiveOdds.ts"), "utf8");
    const dialog = readFileSync(join(root, "components/account/AccountEditDialog.vue"), "utf8");
    const footballStore = readFileSync(join(root, "stores/footballStore.ts"), "utf8");
    expect(fetchSrc).toMatch(/a8Axios/);
    expect(fetchSrc).not.toMatch(/a8PluginPost/);
    expect(fetchSrc).not.toMatch(/hasA8PluginRuntime/);
    expect(fetchSrc).toMatch(/30002/);
    expect(fetchSrc).toMatch(/3020101/);
    expect(fetchSrc).not.toMatch(/Client_GetFootballMatchMarkets/);
    expect(fetchSrc).not.toMatch(/venue-adapter\/ob/);
    expect(markets).toMatch(/fetchObFootballMatchMarkets/);
    expect(markets).not.toMatch(/getFootballMatchMarkets/);
    expect(bar).toMatch(/saveLocalSportObSessionFromPaste/);
    expect(bar).toMatch(/试玩token/);
    expect(bar).toMatch(/fetchPandaSportTrialPaste/);
    expect(bar).not.toMatch(/updateSportObSession/);
    expect(bar).not.toMatch(/getSportObSession/);
    expect(live).toMatch(/readLocalSportObSession/);
    expect(live).not.toMatch(/getSportObSession/);
    expect(dialog).toMatch(/saveLocalSportObSessionFromPaste/);
    expect(dialog).not.toMatch(/updateSportObSession/);
    expect(footballStore).toMatch(/fetchObFootballAsClientMatchDtos/);
    expect(footballStore).toMatch(/getFootballMatchs/);
    expect(footballStore).toMatch(/combineFootballListSources/);
    expect(footballStore).not.toMatch(/updateSportObSession/);
    expect(footballStore).not.toMatch(/getSportObSession/);
  });
});
