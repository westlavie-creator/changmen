<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { ElMessage } from "element-plus";
import {
  formatPodDropPct,
  formatPodPrice,
  isFreshPodAlert,
} from "@/runtime/podAlerts";
import {
  POD_BET_SETTINGS_UPDATED,
  podAlertWithinFollowAge,
  readPodBetSettings,
  type PodBetSettings,
} from "@/runtime/podBetSettings";
import {
  formatPodKickoff,
  formatPodStake,
  listPodFollowTickets,
} from "@/runtime/podBetTicket";
import { recordFootballFollowAttempt } from "@/runtime/footballFollowAttempt";
import { compareFootballFollowShadow } from "@/runtime/footballFollowShadowCompare";
import { readFootballFollowV2Settings, type FootballFollowV2Settings } from "@/runtime/footballFollowV2Settings";
import { getFootballQuote } from "@/runtime/footballQuote";
import {
  formatPodEv,
  pickPodYaboAutoTicket,
  scorePodYaboFollow,
} from "@/runtime/podYabo";
import type { PodOutcomeGateEntry } from "@/runtime/podYabo/gate";
import { openFootballSettings } from "@/runtime/footballSettingsUi";
import {
  fixtureFromViewMatch,
  formatPodFixtureMatch,
  matchPodAlertToFixtures,
  type PodBoardFixture,
} from "@/runtime/podFixtureMatch";
import { resolveFootballFollowDecision } from "@/runtime/footballFollowDecision";
import { buildFootballFollowSelectionShadow } from "@/runtime/footballFollowSelectionKey";
import {
  comparePodVenueQuote,
  formatPodMarketMatch,
  formatPodObQuote,
  matchPodAlertToVenueMarket,
} from "@/runtime/podMarketMatch";
import {
  buildPodBoardFocus,
  requestPodBoardFocus,
} from "@/runtime/podBoardFocus";
import {
  placePodFollowBet,
  podFollowPlaceBlock,
  type PodFollowPlaceTicket,
} from "@/runtime/podFollowPlace";
import {
  pickPodPmAutoTicket,
  placePodPmFollowBet,
  podPmFollowPlaceBlock,
  type PodPmFollowPlaceTicket,
} from "@/runtime/podPmFollowPlace";
import {
  buildPodFollowLogRow,
  buildPodFollowPlaceSnap,
  clearPodFollowLog,
  formatPodFollowLogEv,
  formatPodFollowLogQuote,
  formatPodFollowLogWhen,
  markPodFollowLogPlaced,
  readPodFollowLog,
  ticketHasPodFollowMatch,
  upsertPodFollowEv,
  type PodFollowLogRow,
} from "@/runtime/podFollowLog";
import {
  formatPodFollowPending,
  resolvePodFollowPending,
  type PodFollowPendingState,
} from "@/runtime/podFollowPending";
import { peekObEnglishNames } from "@/runtime/obSportEnglishNames";
import {
  listPodObMissFixtures,
  searchPodObMissFixture,
  subscribePodObMissSearch,
} from "@/runtime/podObMissSearch";
import {
  listPrefetchedObMarkets,
  mergePodBoardMarkets,
  peekPrefetchedObOdds,
  prefetchObSportMatchMarkets,
  prefetchObSportOidQuote,
  subscribePodMarketPrefetch,
} from "@/runtime/podMarketPrefetch";
import { fetchObSportAmount } from "@/runtime/obSportAmount";
import { isUnifiedFootballOrderRow } from "@/shared/orderDomain";
import type { OrderRow } from "@/types/order";
import { useFootballOrderStore } from "@/stores/footballOrderStore";
import { useFootballStore } from "@/stores/footballStore";
import { useObSportLiveStore } from "@/stores/obSportLiveStore";
import { useOrderStore } from "@/stores/orderStore";
import { usePodAlertStore } from "@/stores/podAlertStore";
import { useSportOddsStore } from "@/stores/sportOddsStore";

const POS_KEY = "changmen:podFollowPanel";
const DEFAULT_W = 430;
const DEFAULT_H = 460;
const MIN_W = 280;
const MIN_H = 180;
const HEADER_H = 40;
const MARGIN = 8;

const store = usePodAlertStore();
const football = useFootballStore();
const sportOdds = useSportOddsStore();
const obLive = useObSportLiveStore();
const footballOrders = useFootballOrderStore();
const orderStore = useOrderStore();
const { snapshot, portReady, alerts } = storeToRefs(store);
const { matchs } = storeToRefs(football);
const { tick: sportOddsTick } = storeToRefs(sportOdds);
const { lineTick } = storeToRefs(obLive);
const betSettings = ref<PodBetSettings>(readPodBetSettings());
const followV2 = ref<FootballFollowV2Settings>(readFootballFollowV2Settings());
const nowTick = ref(Date.now());
const missTick = ref(0);
const prefetchTick = ref(0);
const sportAmount = ref(0);
/** 对齐 AutoYabo seenAlertKeys：自动试过的票不再每轮重打 */
const autoAttempted = ref<Record<string, true>>({});
let nowTimer: ReturnType<typeof setInterval> | null = null;
let amountTimer: ReturnType<typeof setInterval> | null = null;
let stopMissSearch: (() => void) | null = null;
let stopPrefetch: (() => void) | null = null;
/** AutoYabo 50ms；Vue 侧 250ms 兼顾反应与开销 */
const AUTO_TICK_MS = 250;
const IDLE_TICK_MS = 1_000;

const tickets = computed(() => {
  void sportOddsTick.value;
  void lineTick.value;
  void missTick.value;
  void prefetchTick.value;
  const live = {
    get: (platform: string, id: string) => peekPrefetchedObOdds(id) || sportOdds.get(platform, id),
    has: (platform: string, id: string) => peekPrefetchedObOdds(id) > 1 || sportOdds.has(platform, id),
    getLine: (oid: string) => obLive.getLine(oid),
  };
  const board = matchs.value.map((row) => {
    const fixture = fixtureFromViewMatch(row);
    const extra = listPrefetchedObMarkets(fixture.obMid);
    const withMarkets = extra.length
      ? { ...fixture, markets: mergePodBoardMarkets(fixture.markets, extra) }
      : fixture;
    const en = peekObEnglishNames(withMarkets.obMid);
    if (!en)
      return withMarkets;
    return { ...withMarkets, homeEn: en.home, awayEn: en.away, gameEn: en.league };
  });
  const seen = new Set(board.map(row => row.obMid).filter(Boolean));
  const fixtures: PodBoardFixture[] = [...board];
  for (const row of listPodObMissFixtures()) {
    if (!row.obMid || seen.has(row.obMid))
      continue;
    const extra = listPrefetchedObMarkets(row.obMid);
    fixtures.push(extra.length ? { ...row, markets: mergePodBoardMarkets(row.markets, extra) } : row);
    seen.add(row.obMid);
  }
  return listPodFollowTickets(alerts.value, { ...betSettings.value, maxAgeSec: 0 }, nowTick.value).map(ticket => {
    const fixtureMatch = matchPodAlertToFixtures(ticket.alert, fixtures);
    const hit = fixtureMatch.status === "matched" ? fixtureMatch.hits[0] : null;
    const scored = scorePodYaboFollow(ticket, {
        fixture: hit?.fixture,
        swapped: hit?.swapped === true,
        live,
        books: snapshot.value.books,
        settings: betSettings.value,
      });
    const pmMarketMatch = hit
      ? matchPodAlertToVenueMarket(ticket.alert, hit.fixture, "Polymarket", hit.swapped === true, live)
      : matchPodAlertToVenueMarket(ticket.alert, null, "Polymarket", false, live);
    const pmQuote = comparePodVenueQuote(pmMarketMatch, "Polymarket", scored.minObOdds, {
      maxObOdds: scored.maxObOdds,
      nvp: scored.nvp,
    });
    const selectionShadow = buildFootballFollowSelectionShadow({
      fixtureMatch,
      fixture: hit?.fixture,
      market: scored.marketMatch,
    });
    const decisionShadow = resolveFootballFollowDecision({
      ticket: scored,
      fixtureMatch,
      marketMatch: scored.marketMatch,
      quote: scored.obQuote,
      selectionShadow,
    });
    const quoteShadow = getFootballQuote({
      key: selectionShadow.key,
      fallbackOdds: Number(scored.marketMatch.quote) || 0,
      reader: {
        hasLive: (platform, id) => sportOdds.has(platform, id),
        getLive: (platform, id) => sportOdds.get(platform, id),
        getPrefetch: id => peekPrefetchedObOdds(id),
        getLine: id => obLive.getLine(id),
      },
    });
    const legacyBlock = podFollowPlaceBlock({
      id: scored.id,
      stake: followStakeFor("OB"),
      fixtureStatus: fixtureMatch.status,
      fixtureBasis: fixtureMatch.basis,
      obMid: String(hit?.fixture.obMid || "").trim(),
      home: scored.alert.home,
      away: scored.alert.away,
      sideLabel: scored.sideLabel,
      marketLabel: scored.marketLabel,
      market: scored.marketMatch,
      quote: scored.obQuote,
    });
    const shadowCompare = compareFootballFollowShadow({
      marketMatch: scored.marketMatch,
      obQuote: scored.obQuote,
      selectionShadow,
      quoteShadow,
      decisionShadow,
      legacyBlock,
    });
    return {
      ...scored,
      selectionShadow,
      decisionShadow,
      quoteShadow,
      legacyBlock,
      shadowCompare,
      pmMarketMatch,
      pmQuote,
      fixtureMatch,
    };
  });
});
const logRows = ref<PodFollowLogRow[]>(readPodFollowLog());
const liveById = computed(() => new Map(
  tickets.value.filter(ticketHasPodFollowMatch).map(ticket => [ticket.id, ticket]),
));

function decisionFixtureLabel(ticket: (typeof tickets.value)[number]): string {
  const f = ticket.decisionShadow.fixture;
  if (f.status !== "matched")
    return f.status === "pending" ? "场:待确认" : "场:未对";
  return f.confidence === "exact" ? "场:确" : "场:猜";
}

function decisionMarketLabel(ticket: (typeof tickets.value)[number]): string {
  const m = ticket.decisionShadow.market;
  if (m.status === "matched")
    return "盘:已对";
  if (m.status === "skipped")
    return "盘:跳过";
  return "盘:未对";
}

function decisionQuoteLabel(ticket: (typeof tickets.value)[number]): string {
  const q = ticket.decisionShadow.quote;
  if (q.status === "ok")
    return "价:够";
  if (q.status === "locked")
    return "价:锁";
  if (q.status === "below_min")
    return "价:不足";
  if (q.status === "spike")
    return "价:异常";
  return "价:缺";
}

function quoteShadowLabel(ticket: (typeof tickets.value)[number]): string {
  const q = ticket.quoteShadow;
  const src = q.source === "live"
    ? "live"
    : q.source === "prefetch"
      ? "pre"
      : q.source === "http"
        ? "http"
        : "miss";
  if (q.locked)
    return `${src}:锁`;
  return q.odds > 0 ? `${src}:${formatPodPrice(q.odds)}` : src;
}

function decisionAutoLabel(ticket: (typeof tickets.value)[number]): string {
  if (ticket.decisionShadow.action.canAutoPlace)
    return "自动:可";
  if (ticket.decisionShadow.action.canManualPlace)
    return "自动:否";
  return `阻断:${ticket.decisionShadow.action.blockReason || "未知"}`;
}

function decisionShadowText(ticket: (typeof tickets.value)[number]): string {
  return [
    decisionFixtureLabel(ticket),
    decisionMarketLabel(ticket),
    decisionQuoteLabel(ticket),
    quoteShadowLabel(ticket),
    decisionAutoLabel(ticket),
    gateCompareLabel(ticket),
    shadowCompareLabel(ticket),
  ].join(" · ");
}

function gateCompareLabel(ticket: (typeof tickets.value)[number]): string {
  const legacy = String(ticket.legacyBlock || "").trim();
  const shadow = String(ticket.decisionShadow.action.blockReason || "").trim();
  return legacy === shadow ? "门:同" : "门:差";
}

function shadowCompareLabel(ticket: (typeof tickets.value)[number]): string {
  return ticket.shadowCompare.ok ? "影:同" : `影:${ticket.shadowCompare.reasons.length}`;
}

function decisionShadowTone(ticket: (typeof tickets.value)[number]): string {
  if (ticket.decisionShadow.action.canAutoPlace)
    return "ok";
  if (ticket.decisionShadow.action.canManualPlace)
    return "wait";
  return "block";
}

function decisionShadowTitle(ticket: (typeof tickets.value)[number]): string {
  const key = ticket.selectionShadow.key;
  const base = [
    `fixture=${ticket.decisionShadow.fixture.reason}`,
    `market=${ticket.decisionShadow.market.reason}`,
    `quote=${ticket.decisionShadow.quote.reason}`,
    `selection=${ticket.selectionShadow.reason}`,
    `quoteShadow=${ticket.quoteShadow.source}:${ticket.quoteShadow.locked ? "locked" : ticket.quoteShadow.odds}:${ticket.quoteShadow.line ?? ""}`,
    `legacyBlock=${ticket.legacyBlock || "ok"}`,
    `shadowCompare=${ticket.shadowCompare.summary}`,
  ];
  if (key) {
    base.push(
      `key=${key.matchKey}|${key.period}|${key.marketCode}|${key.line ?? ""}|${key.side}|${key.oddId}|${key.confidence}`,
    );
  }
  return base.join(" ");
}

const followObEnabled = computed(() => betSettings.value.followAccountIds.length > 0);
const followPmEnabled = computed(() => betSettings.value.pmFollowAccountIds.length > 0);

function refreshLog() {
  logRows.value = readPodFollowLog();
}

function recordLiveTickets() {
  let wrote = false;
  for (const ticket of tickets.value) {
    if (!ticketHasPodFollowMatch(ticket))
      continue;
    const next = upsertPodFollowEv(buildPodFollowLogRow(ticket, nowTick.value));
    if (next.added || next.wrote)
      wrote = true;
  }
  if (wrote)
    refreshLog();
}

watch(tickets, recordLiveTickets, { immediate: true });

watch(tickets, (rows) => {
  for (const ticket of rows) {
    if (ticket.fixtureMatch.status === "none")
      void searchPodObMissFixture(ticket.alert);
    const hit = ticket.fixtureMatch.status === "matched" ? ticket.fixtureMatch.hits[0] : null;
    const mid = String(hit?.fixture.obMid || "").trim();
    if (mid && ticket.marketMatch.status !== "matched")
      void prefetchObSportMatchMarkets(mid);
    const oid = String(ticket.marketMatch.oid || "").trim();
    if (oid && mid)
      void prefetchObSportOidQuote(oid, mid, {
        marketCode: ticket.marketMatch.marketCode,
        boardSide: ticket.marketMatch.boardSide || undefined,
        odds: Number(ticket.marketMatch.quote) || Number(ticket.obQuote.quote) || 0,
      });
  }
  // 票一就绪立刻试，不等下一轮 tick（对齐 AutoYabo 新行立刻处理）
  if (betSettings.value.autoPlace)
    void maybeAutoPlace();
}, { immediate: true });

function jumpToTicket(ticket: (typeof tickets.value)[number]) {
  if (ticket.fixtureMatch.status !== "matched")
    return;
  const hit = ticket.fixtureMatch.hits[0];
  if (!hit)
    return;
  requestPodBoardFocus(buildPodBoardFocus(hit.fixture, ticket.marketMatch));
}

function followStakeFor(venue: "OB" | "Polymarket"): number {
  return Number(venue === "OB" ? betSettings.value.obStake : betSettings.value.pmStake) || 0;
}

function formatEnabledVenueStakes(): string {
  const parts: string[] = [];
  if (followObEnabled.value)
    parts.push(`OB ${formatPodStake(followStakeFor("OB"))}`);
  if (followPmEnabled.value)
    parts.push(`PM ${formatPodStake(followStakeFor("Polymarket"))}`);
  return parts.join(" · ") || "未选账号";
}

const followSummary = computed(() => {
  const parts = [formatEnabledVenueStakes()];
  parts.push(`自动${betSettings.value.autoPlace ? "开" : "关"}`);
  if (sportAmount.value > 0 && venueSelectedAccountCount("OB") <= 1)
    parts.push(`余额 ${sportAmount.value}`);
  return parts.join(" · ");
});

function ticketPlacePayload(ticket: (typeof tickets.value)[number], auto = false): PodFollowPlaceTicket {
  const hit = ticket.fixtureMatch.status === "matched" ? ticket.fixtureMatch.hits[0] : null;
  return {
    id: ticket.id,
    stake: followStakeFor("OB"),
    fixtureStatus: ticket.fixtureMatch.status,
    fixtureBasis: ticket.fixtureMatch.basis,
    obMid: String(hit?.fixture.obMid || "").trim(),
    home: ticket.alert.home,
    away: ticket.alert.away,
    sideLabel: ticket.sideLabel,
    marketLabel: ticket.marketLabel,
    auto,
    accountIds: betSettings.value.followAccountIds,
    market: ticket.marketMatch,
    quote: ticket.obQuote,
  };
}

function pmTicketPlacePayload(ticket: (typeof tickets.value)[number], auto = false): PodPmFollowPlaceTicket {
  const hit = ticket.fixtureMatch.status === "matched" ? ticket.fixtureMatch.hits[0] : null;
  return {
    id: ticket.id,
    stake: followStakeFor("Polymarket"),
    fixtureStatus: ticket.fixtureMatch.status,
    fixtureBasis: ticket.fixtureMatch.basis,
    pmMatchId: String(hit?.fixture.pmMid || hit?.fixture.id || "").trim(),
    home: ticket.alert.home,
    away: ticket.alert.away,
    sideLabel: ticket.sideLabel,
    marketLabel: ticket.marketLabel,
    auto,
    accountIds: betSettings.value.pmFollowAccountIds,
    market: ticket.pmMarketMatch,
    quote: ticket.pmQuote,
  };
}

const placingId = ref("");
const placingPmId = ref("");
const placed = ref<Record<string, true>>({});
const placeNote = ref<Record<string, string>>({});

function venuePlaceKey(venue: "OB" | "Polymarket", id: string): string {
  return `${venue}:${String(id || "").trim()}`;
}

function orderCreateMs(row: OrderRow): number {
  const n = Number(row.CreateAt) || 0;
  return n > 0 && n < 10_000_000_000 ? n * 1000 : n;
}

function isTodayOrderRow(row: OrderRow): boolean {
  const at = orderCreateMs(row);
  if (!(at > 0))
    return false;
  const d = new Date(at);
  const now = new Date(nowTick.value);
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate();
}

function pmUnifiedFootballRows(opts: { todayOnly?: boolean } = {}): OrderRow[] {
  const out: OrderRow[] = [];
  for (const group of orderStore.orders.values()) {
    for (const row of group) {
      if (opts.todayOnly && !isTodayOrderRow(row))
        continue;
      if (
        String(row.Type || "").trim() === "Polymarket"
        && row.PmSide !== "sell"
        && isUnifiedFootballOrderRow(row)
        && String(row.Source || "").trim().startsWith("football-pod")
      ) {
        out.push(row);
      }
    }
  }
  return out;
}

function pmPodClientId(row: OrderRow): string {
  return String(row.PodClientId || "").trim();
}

function isPmUnifiedPodPlaced(id: string): boolean {
  const want = String(id || "").trim();
  return !!want && pmUnifiedFootballRows().some(row => pmPodClientId(row) === want);
}

function pmUnifiedOrderKey(row: OrderRow): string {
  return String(row.OrderID || `${row.PlayerID || ""}:${row.CreateAt || ""}`).trim();
}

function pmUnifiedPendingCap() {
  let todayProfit = 0;
  let openStake = 0;
  for (const row of pmUnifiedFootballRows({ todayOnly: true })) {
    const status = String(row.Status || "None").trim().toLowerCase();
    if (!status || status === "none" || status === "pending")
      openStake += Number(row.BetMoney) || 0;
    else
      todayProfit += Number(row.Money) || 0;
  }
  return { todayProfit, openStake };
}

function hasVenueOrder(id: string, venue: "OB" | "Polymarket"): boolean {
  const want = String(id || "").trim();
  if (!want)
    return false;
  if (venue === "Polymarket")
    return isPmUnifiedPodPlaced(want);
  const rows = [...footballOrders.todayRows, ...footballOrders.rows];
  return rows.some((row) => {
    if (String(row.venue || "OB").trim() !== venue)
      return false;
    const rowId = String(row.id || "").trim();
    return rowId === want || rowId.startsWith(`${want}#`);
  });
}

function venueOrderCountToday(venue: "OB" | "Polymarket"): number {
  if (venue === "Polymarket") {
    const seen = new Set<string>();
    for (const row of pmUnifiedFootballRows({ todayOnly: true })) {
      const key = pmUnifiedOrderKey(row);
      if (key)
        seen.add(key);
    }
    return seen.size;
  }
  const seen = new Set<string>();
  for (const row of footballOrders.todayRows) {
    if (String(row.venue || "OB").trim() !== venue)
      continue;
    const key = String(row.orderId || row.id || `${row.playerId || ""}:${row.at || ""}`).trim();
    if (key)
      seen.add(key);
  }
  return seen.size;
}

function venueDailyOrderLimit(venue: "OB" | "Polymarket"): number {
  return venue === "OB"
    ? Math.round(Number(betSettings.value.obDailyOrderLimit) || 0)
    : Math.round(Number(betSettings.value.pmDailyOrderLimit) || 0);
}

function venueSelectedAccountCount(venue: "OB" | "Polymarket"): number {
  return venue === "OB"
    ? betSettings.value.followAccountIds.length
    : betSettings.value.pmFollowAccountIds.length;
}

function venueDailyOrderBlock(venue: "OB" | "Polymarket"): string | null {
  const limit = venueDailyOrderLimit(venue);
  if (!(limit > 0))
    return null;
  const current = venueOrderCountToday(venue);
  const next = venueSelectedAccountCount(venue);
  if (current >= limit)
    return `${venue === "OB" ? "OB" : "PM"} 今日单数已满`;
  if (next > 0 && current + next > limit)
    return `${venue === "OB" ? "OB" : "PM"} 今日剩余 ${Math.max(0, limit - current)} 单`;
  return null;
}

function isVenuePlaced(id: string, venue: "OB" | "Polymarket"): boolean {
  const key = venuePlaceKey(venue, id);
  if (placed.value[key] || hasVenueOrder(id, venue))
    return true;
  return venue === "OB" && logRows.value.some(row => row.id === id && row.placed);
}

function isPlaced(id: string): boolean {
  return isVenuePlaced(id, "OB") || isVenuePlaced(id, "Polymarket");
}

function placeBlock(ticket: (typeof tickets.value)[number]): string | null {
  if (isVenuePlaced(ticket.id, "OB"))
    return "已下过";
  const dailyBlock = venueDailyOrderBlock("OB");
  if (dailyBlock)
    return dailyBlock;
  return podFollowPlaceBlock(ticketPlacePayload(ticket));
}

function pmPlaceBlock(ticket: (typeof tickets.value)[number]): string | null {
  if (isVenuePlaced(ticket.id, "Polymarket"))
    return "已下过";
  const dailyBlock = venueDailyOrderBlock("Polymarket");
  if (dailyBlock)
    return dailyBlock;
  return podPmFollowPlaceBlock(pmTicketPlacePayload(ticket));
}

function placeLabel(ticket: (typeof tickets.value)[number]): string {
  if (isVenuePlaced(ticket.id, "OB"))
    return "已下";
  if (placingId.value === ticket.id)
    return "下单中";
  return "下单";
}

function pmPlaceLabel(ticket: (typeof tickets.value)[number]): string {
  if (isVenuePlaced(ticket.id, "Polymarket"))
    return "已下";
  if (placingPmId.value === ticket.id)
    return "PM中";
  return "下PM";
}

function pendingCap() {
  const pm = pmUnifiedPendingCap();
  return {
    todayProfit: footballOrders.todayProfit + pm.todayProfit,
    openStake: footballOrders.todayOpenStake + pm.openStake,
    maxDailyLoss: betSettings.value.maxDailyLoss,
  };
}

function pendingPlacedIds(): string[] {
  return [
    ...Object.keys(placed.value).filter(key => key.startsWith("OB:")).map(key => key.slice(3)),
    ...Object.keys(autoAttempted.value).filter(key => key.startsWith("OB:")).map(key => key.slice(3)),
    ...logRows.value.filter(row => row.placed).map(row => row.id),
  ];
}

function pendingPmPlacedIds(): string[] {
  return [
    ...Object.keys(placed.value).filter(key => key.startsWith("Polymarket:")).map(key => key.slice("Polymarket:".length)),
    ...Object.keys(autoAttempted.value).filter(key => key.startsWith("Polymarket:")).map(key => key.slice("Polymarket:".length)),
    ...pmUnifiedFootballRows()
      .map(row => pmPodClientId(row))
      .filter(Boolean),
  ];
}

function pendingPlacedEntries() {
  return logRows.value
    .filter(row => row.placed && row.obMid && row.boardSide)
    .map(row => ({
      obMid: row.obMid,
      marketCode: row.marketCode,
      boardSide: row.boardSide,
    }));
}

function inferPmMarketCode(label: unknown): string {
  const s = String(label || "").toLowerCase();
  if (/大小|total|over|under|o\/u/.test(s))
    return "totals";
  if (/让球|spread|handicap|ah/.test(s))
    return "spreads";
  if (/独赢|胜负|moneyline|winner|1x2/.test(s))
    return "moneyline";
  return "";
}

function inferPmBoardSide(label: unknown): PodOutcomeGateEntry["boardSide"] {
  const s = String(label || "").toLowerCase();
  if (/大|over/.test(s))
    return "over";
  if (/小|under/.test(s))
    return "under";
  if (/主|home/.test(s))
    return "home";
  if (/客|away/.test(s))
    return "away";
  if (/平|draw/.test(s))
    return "draw";
  return null;
}

function pmGateEntryFromPayload(payload: PodPmFollowPlaceTicket): PodOutcomeGateEntry | null {
  const obMid = String(payload.pmMatchId || "").trim();
  const marketCode = String(payload.market.marketCode || "").trim();
  const boardSide = payload.market.boardSide ?? null;
  if (!obMid || !marketCode || !boardSide)
    return null;
  return { obMid, marketCode, boardSide };
}

function pendingPmPlacedEntries(): PodOutcomeGateEntry[] {
  const out: PodOutcomeGateEntry[] = [];
  const push = (row: PodOutcomeGateEntry | null | undefined) => {
    if (!row?.obMid || !row.marketCode || !row.boardSide)
      return;
    out.push(row);
  };
  const pmKeys = new Set([
    ...Object.keys(placed.value).filter(key => key.startsWith("Polymarket:")).map(key => key.slice("Polymarket:".length)),
    ...Object.keys(autoAttempted.value).filter(key => key.startsWith("Polymarket:")).map(key => key.slice("Polymarket:".length)),
  ]);
  for (const row of tickets.value) {
    if (!pmKeys.has(row.id))
      continue;
    push(pmGateEntryFromPayload(pmTicketPlacePayload(row, true)));
  }
  for (const row of footballOrders.todayRows) {
    if (String(row.venue || "").trim() !== "Polymarket")
      continue;
    const obMid = String(row.obMid || "").trim();
    const marketCode = inferPmMarketCode(row.marketLabel);
    const boardSide = inferPmBoardSide(row.sideLabel);
    push({ obMid, marketCode, boardSide });
  }
  for (const row of pmUnifiedFootballRows()) {
    const obMid = String(row.PodPmMatchId || row.PmConditionId || "").trim();
    const marketCode = inferPmMarketCode(row.Bet);
    const boardSide = inferPmBoardSide(row.Item);
    push({ obMid, marketCode, boardSide });
  }
  return out;
}

function pendingStateFor(
  live: (typeof tickets.value)[number] | undefined,
  log: PodFollowLogRow,
): PodFollowPendingState {
  return resolvePodFollowPending({
    ticket: live ? ticketPlacePayload(live) : null,
    placed: isVenuePlaced(log.id, "OB"),
    placing: placingId.value === log.id,
    autoPlace: betSettings.value.autoPlace,
    withinAge: live
      ? podAlertWithinFollowAge(live.alert, betSettings.value.maxAgeSec, nowTick.value)
      : false,
    maxAgeSec: betSettings.value.maxAgeSec,
    autoAttempted: !!autoAttempted.value[venuePlaceKey("OB", log.id)],
    placeNote: placeNote.value[venuePlaceKey("OB", log.id)] || log.placeNote,
    placedAt: log.placedAt || (isVenuePlaced(log.id, "OB") ? log.at : 0),
    home: live?.alert.home || log.home,
    away: live?.alert.away || log.away,
    sideLabel: live?.sideLabel || log.sideLabel,
    marketLabel: live?.marketLabel || log.marketLabel,
    now: nowTick.value,
    placedIds: pendingPlacedIds(),
    placedEntries: pendingPlacedEntries(),
    cap: pendingCap(),
  });
}

const displayRows = computed(() => {
  void nowTick.value;
  void placingId.value;
  void placingPmId.value;
  void placed.value;
  void autoAttempted.value;
  void placeNote.value;
  void betSettings.value.autoPlace;
  void betSettings.value.maxAgeSec;
  void betSettings.value.maxDailyLoss;
  void footballOrders.todayProfit;
  void footballOrders.todayOpenStake;
  return logRows.value
    .filter(log => log.obMid)
    .map(log => {
      const live = liveById.value.get(log.id);
      return {
        log,
        live,
        pending: pendingStateFor(live, log),
      };
    });
});

function onDisplayClick(row: { live?: (typeof tickets.value)[number]; log: PodFollowLogRow }) {
  if (row.live)
    jumpToTicket(row.live);
  else
    jumpToLog(row.log);
}

async function placeTicket(ticket: (typeof tickets.value)[number], auto: boolean) {
  if (placingId.value)
    return;
  recordObAttempt(ticket, auto ? "auto_attempt" : "manual_click");
  const payload = ticketPlacePayload(ticket, auto);
  const block = venueDailyOrderBlock("OB") || podFollowPlaceBlock(payload);
  if (block) {
    recordObAttempt(ticket, "blocked", { reason: block });
    if (!auto)
      ElMessage.warning(block);
    return;
  }
  if (isVenuePlaced(ticket.id, "OB")) {
    recordObAttempt(ticket, "blocked", { reason: "已下过" });
    if (!auto)
      ElMessage.info("已下过");
    return;
  }
  placingId.value = ticket.id;
  try {
    const result = await placePodFollowBet(payload);
    const key = venuePlaceKey("OB", ticket.id);
    placeNote.value = { ...placeNote.value, [key]: result.message };
    if (result.ok) {
      recordObAttempt(ticket, "placed", { message: result.message });
      placed.value = { ...placed.value, [key]: true };
      logRows.value = markPodFollowLogPlaced(
        ticket.id,
        result.message,
        Date.now(),
        buildPodFollowPlaceSnap(ticket),
      );
      ElMessage.success(result.message);
      return;
    }
    recordObAttempt(ticket, "failed", { message: result.message });
    if (auto)
      ElMessage.warning(result.message);
    else
      ElMessage.error(result.message);
  }
  finally {
    placingId.value = "";
  }
}

async function placePmTicket(ticket: (typeof tickets.value)[number], auto = false) {
  if (placingPmId.value)
    return;
  const payload = pmTicketPlacePayload(ticket, auto);
  const block = venueDailyOrderBlock("Polymarket") || podPmFollowPlaceBlock(payload);
  if (block) {
    if (!auto)
      ElMessage.warning(block);
    return;
  }
  if (isVenuePlaced(ticket.id, "Polymarket")) {
    if (!auto)
      ElMessage.info("已下过");
    return;
  }
  placingPmId.value = ticket.id;
  try {
    const result = await placePodPmFollowBet(payload);
    const key = venuePlaceKey("Polymarket", ticket.id);
    placeNote.value = { ...placeNote.value, [key]: result.message };
    if (result.ok) {
      placed.value = { ...placed.value, [key]: true };
      ElMessage.success(result.message);
      return;
    }
    if (auto)
      ElMessage.warning(result.message);
    else
      ElMessage.error(result.message);
  }
  finally {
    placingPmId.value = "";
  }
}

function onPlaceClick(ev: MouseEvent, ticket: (typeof tickets.value)[number]) {
  ev.stopPropagation();
  void placeTicket(ticket, false);
}

function onPmPlaceClick(ev: MouseEvent, ticket: (typeof tickets.value)[number]) {
  ev.stopPropagation();
  void placePmTicket(ticket, false);
}

async function maybeAutoPlace() {
  if (!betSettings.value.autoPlace || placingId.value || placingPmId.value)
    return;
  const ageOk = tickets.value.filter(ticket =>
    podAlertWithinFollowAge(ticket.alert, betSettings.value.maxAgeSec, nowTick.value),
  );
  const skipped = pendingPlacedIds();
  const placedEntries = pendingPlacedEntries();
  const cap = pendingCap();
  // 暖一下预检价，给 EV/锁盘判断；真下单仍走 queryBetAmountPB
  if (followObEnabled.value) {
    for (const ticket of ageOk.slice(0, 6)) {
      const payload = ticketPlacePayload(ticket);
      if (payload.fixtureBasis !== "confirmed")
        continue;
      if (podFollowPlaceBlock(payload))
        continue;
      const oid = String(payload.market.oid || "").trim();
      const mid = String(payload.obMid || "").trim();
      if (oid && mid)
        void prefetchObSportOidQuote(oid, mid, {
          marketCode: payload.market.marketCode,
          boardSide: payload.market.boardSide || undefined,
          odds: Number(payload.quote.quote) || Number(payload.market.quote) || 0,
        });
    }
  }
  if (followObEnabled.value) {
    const next = pickPodYaboAutoTicket(
      ageOk.map(row => ticketPlacePayload(row)),
      skipped,
      placedEntries,
      cap,
    );
    if (next) {
      const ui = tickets.value.find(row => row.id === next.id);
      if (ui) {
        // 先占坑再下：对齐 seenAlertKeys，避免管道慢时重复打同一票
        autoAttempted.value = { ...autoAttempted.value, [venuePlaceKey("OB", next.id)]: true };
        await placeTicket(ui, true);
      }
    }
  }
  if (!followPmEnabled.value)
    return;
  const pmNext = pickPodPmAutoTicket(
    ageOk.map(row => pmTicketPlacePayload(row, true)),
    pendingPmPlacedIds(),
    pendingPmPlacedEntries(),
    cap,
  );
  if (!pmNext)
    return;
  const pmUi = tickets.value.find(row => row.id === pmNext.id);
  if (!pmUi)
    return;
  autoAttempted.value = { ...autoAttempted.value, [venuePlaceKey("Polymarket", pmNext.id)]: true };
  await placePmTicket(pmUi, true);
}

function placeButtonTitle(ticket: (typeof tickets.value)[number]): string | undefined {
  const block = placeBlock(ticket);
  if (block)
    return block;
  const pending = pendingStateFor(ticket, {
    id: ticket.id,
    at: 0,
    home: "",
    away: "",
    league: "",
    sideLabel: "",
    marketLabel: "",
    nvp: 0,
    minObOdds: 0,
    maxObOdds: 0,
    obQuote: 0,
    pinPrevious: 0,
    pinCurrent: 0,
    dropPct: 0,
    stake: 0,
    oid: "",
    obMid: "",
    marketCode: "",
    boardSide: null,
    boardLine: null,
    placed: isVenuePlaced(ticket.id, "OB"),
    placedAt: 0,
    placeNote: placeNote.value[venuePlaceKey("OB", ticket.id)] || "",
  });
  if (pending.placed || pending.detail === "可手点" || pending.detail === "待自动")
    return undefined;
  return formatPodFollowPending(pending);
}

function pmPlaceButtonTitle(ticket: (typeof tickets.value)[number]): string | undefined {
  const block = pmPlaceBlock(ticket);
  return block || undefined;
}

function recordObAttempt(
  ticket: (typeof tickets.value)[number],
  status: "manual_click" | "auto_attempt" | "blocked" | "placed" | "failed",
  opts: { reason?: string; message?: string } = {},
) {
  const shadowMessage = ticket.shadowCompare.ok ? "" : `shadow:${ticket.shadowCompare.summary}`;
  const message = [opts.message, shadowMessage].filter(Boolean).join(" | ");
  recordFootballFollowAttempt({
    ticketId: ticket.id,
    venue: "OB",
    status,
    reason: opts.reason,
    message,
    auto: status === "auto_attempt",
    odds: Number(ticket.obQuote.quote) || Number(ticket.marketMatch.quote) || 0,
    stake: followStakeFor("OB"),
    selection: ticket.selectionShadow.key,
  });
}

const collapsed = ref(false);
const left = ref(0);
const top = ref(72);
const width = ref(DEFAULT_W);
const height = ref(DEFAULT_H);
const dragging = ref(false);
const resizing = ref(false);
let dragDx = 0;
let dragDy = 0;
let resizeStartX = 0;
let resizeStartY = 0;
let resizeStartW = 0;
let resizeStartH = 0;

const statusText = computed(() => {
  if (!betSettings.value.enabled)
    return "筛选已关";
  if (!portReady.value)
    return "扩展未连通";
  if (snapshot.value.sourceConnected && snapshot.value.gridFound) {
    const n = displayRows.value.length;
    const live = tickets.value.filter(ticketHasPodFollowMatch).length;
    if (!n)
      return "等待机会";
    return betSettings.value.autoPlace
      ? `${n} 条 · ${live} 在线 · 自动开`
      : `${n} 条 · ${live} 在线`;
  }
  if (snapshot.value.sourceConnected)
    return "等 Dropping Odds";
  return "等待 POD 页";
});

const statusKind = computed(() => {
  if (!betSettings.value.enabled)
    return "idle";
    if (tickets.value.length || logRows.value.length)
      return "ok";
  if (portReady.value)
    return "wait";
  return "idle";
});

const panelStyle = computed(() => ({
  left: `${left.value}px`,
  top: `${top.value}px`,
  width: `${width.value}px`,
  height: collapsed.value ? `${HEADER_H}px` : `${height.value}px`,
}));

function clampPos(x: number, y: number) {
  const w = width.value;
  const h = collapsed.value ? HEADER_H : height.value;
  const maxX = Math.max(MARGIN, window.innerWidth - w - MARGIN);
  const maxY = Math.max(MARGIN, window.innerHeight - Math.min(h, 80) - MARGIN);
  left.value = Math.min(maxX, Math.max(MARGIN, x));
  top.value = Math.min(maxY, Math.max(MARGIN, y));
}

function clampSize(nextW: number, nextH: number) {
  const maxW = Math.max(MIN_W, window.innerWidth - left.value - MARGIN);
  const maxH = Math.max(MIN_H, window.innerHeight - top.value - MARGIN);
  width.value = Math.min(maxW, Math.max(MIN_W, Math.round(nextW)));
  height.value = Math.min(maxH, Math.max(MIN_H, Math.round(nextH)));
}

function loadPos() {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw)
      return;
    const parsed = JSON.parse(raw) as {
      left?: unknown;
      top?: unknown;
      width?: unknown;
      height?: unknown;
      collapsed?: unknown;
    };
    if (typeof parsed.collapsed === "boolean")
      collapsed.value = parsed.collapsed;
    if (Number.isFinite(Number(parsed.width)) && Number.isFinite(Number(parsed.height)))
      clampSize(Number(parsed.width), Number(parsed.height));
    if (Number.isFinite(Number(parsed.left)) && Number.isFinite(Number(parsed.top)))
      clampPos(Number(parsed.left), Number(parsed.top));
  }
  catch { /* ignore */ }
}

function savePos() {
  localStorage.setItem(POS_KEY, JSON.stringify({
    left: left.value,
    top: top.value,
    width: width.value,
    height: height.value,
    collapsed: collapsed.value,
  }));
}

function onHeaderPointerDown(ev: PointerEvent) {
  if ((ev.target as HTMLElement | null)?.closest("button, .pod-follow-panel__resize"))
    return;
  dragging.value = true;
  dragDx = ev.clientX - left.value;
  dragDy = ev.clientY - top.value;
  (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
}

function onHeaderPointerMove(ev: PointerEvent) {
  if (!dragging.value)
    return;
  clampPos(ev.clientX - dragDx, ev.clientY - dragDy);
}

function onHeaderPointerUp(ev: PointerEvent) {
  if (!dragging.value)
    return;
  dragging.value = false;
  try {
    (ev.currentTarget as HTMLElement).releasePointerCapture(ev.pointerId);
  }
  catch { /* ignore */ }
  savePos();
}

function onResizePointerDown(ev: PointerEvent) {
  ev.preventDefault();
  ev.stopPropagation();
  resizing.value = true;
  resizeStartX = ev.clientX;
  resizeStartY = ev.clientY;
  resizeStartW = width.value;
  resizeStartH = height.value;
  (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
}

function onResizePointerMove(ev: PointerEvent) {
  if (!resizing.value)
    return;
  clampSize(
    resizeStartW + (ev.clientX - resizeStartX),
    resizeStartH + (ev.clientY - resizeStartY),
  );
}

function onResizePointerUp(ev: PointerEvent) {
  if (!resizing.value)
    return;
  resizing.value = false;
  try {
    (ev.currentTarget as HTMLElement).releasePointerCapture(ev.pointerId);
  }
  catch { /* ignore */ }
  savePos();
}

function toggleCollapsed() {
  collapsed.value = !collapsed.value;
  savePos();
}

function onWindowResize() {
  clampSize(width.value, height.value);
  clampPos(left.value, top.value);
}

function restartAutoTick() {
  if (nowTimer) {
    clearInterval(nowTimer);
    nowTimer = null;
  }
  const ms = betSettings.value.autoPlace ? AUTO_TICK_MS : IDLE_TICK_MS;
  nowTimer = setInterval(() => {
    nowTick.value = Date.now();
    void maybeAutoPlace();
  }, ms);
  if (betSettings.value.autoPlace)
    void maybeAutoPlace();
}

async function refreshSportAmount() {
  try {
    sportAmount.value = await fetchObSportAmount();
  }
  catch {
    sportAmount.value = 0;
  }
}

function reloadBetSettings() {
  const prevAuto = betSettings.value.autoPlace;
  betSettings.value = readPodBetSettings();
  followV2.value = readFootballFollowV2Settings();
  if (prevAuto !== betSettings.value.autoPlace)
    restartAutoTick();
}

function openPodSettings() {
  openFootballSettings("pod");
}

function jumpToLog(row: PodFollowLogRow) {
  if (!row.obMid)
    return;
  requestPodBoardFocus({
    matchId: 0,
    obMid: row.obMid,
    marketCode: row.marketCode,
    side: row.boardSide,
    line: row.boardLine,
    oid: row.oid,
  });
}

function onClearLog() {
  logRows.value = clearPodFollowLog();
  placed.value = {};
  placeNote.value = {};
}

onMounted(() => {
  left.value = Math.max(MARGIN, window.innerWidth - DEFAULT_W - 440);
  loadPos();
  store.start();
  reloadBetSettings();
  refreshLog();
  placed.value = Object.fromEntries(logRows.value
    .filter(row => row.placed)
    .map(row => [venuePlaceKey("OB", row.id), true as const]));
  window.addEventListener("resize", onWindowResize);
  window.addEventListener(POD_BET_SETTINGS_UPDATED, reloadBetSettings);
  stopMissSearch = subscribePodObMissSearch(() => {
    missTick.value += 1;
  });
  stopPrefetch = subscribePodMarketPrefetch(() => {
    prefetchTick.value += 1;
  });
  restartAutoTick();
  void orderStore.fetchOrders(undefined, { sideEffects: false });
  void refreshSportAmount();
  amountTimer = setInterval(() => {
    void refreshSportAmount();
  }, 30_000);
});

onUnmounted(() => {
  window.removeEventListener("resize", onWindowResize);
  window.removeEventListener(POD_BET_SETTINGS_UPDATED, reloadBetSettings);
  stopMissSearch?.();
  stopPrefetch?.();
  stopMissSearch = null;
  stopPrefetch = null;
  if (nowTimer) {
    clearInterval(nowTimer);
    nowTimer = null;
  }
  if (amountTimer) {
    clearInterval(amountTimer);
    amountTimer = null;
  }
});
</script>

<template>
  <div
    class="pod-follow-panel"
    :class="{ 'is-collapsed': collapsed, 'is-dragging': dragging || resizing }"
    :style="panelStyle"
  >
    <div
      class="pod-follow-panel__header"
      @pointerdown="onHeaderPointerDown"
      @pointermove="onHeaderPointerMove"
      @pointerup="onHeaderPointerUp"
      @pointercancel="onHeaderPointerUp"
    >
      <span class="pod-follow-panel__dot" :class="`is-${statusKind}`" />
      <span class="pod-follow-panel__title">POD 跟单</span>
      <span class="pod-follow-panel__status">{{ statusText }}</span>
      <button type="button" class="pod-follow-panel__btn" @click="openPodSettings">
        设置
      </button>
      <button type="button" class="pod-follow-panel__btn" @click="toggleCollapsed">
        {{ collapsed ? "展开" : "收起" }}
      </button>
    </div>
    <div v-show="!collapsed" class="pod-follow-panel__summary" @pointerdown.stop>
      <span class="pod-follow-panel__summary-label">配置</span>
      <span class="pod-follow-panel__summary-text">{{ followSummary }}</span>
    </div>
    <div v-show="!collapsed" class="pod-follow-panel__body">
      <p v-if="!betSettings.enabled" class="pod-follow-panel__hint">
        筛选已关。打开「足球设置 → POD跟单」后，对上场和盘的会一直留在列表里，并标已下/未下。降赔浮窗不受影响。
      </p>
      <template v-else>
        <div v-if="logRows.length" class="pod-follow-panel__toolbar" @pointerdown.stop>
          <button type="button" class="pod-follow-panel__btn" @click="onClearLog">
            清空
          </button>
        </div>
        <p v-if="!snapshot.sourceConnected && !displayRows.length" class="pod-follow-panel__hint">
          等 POD 连通后，对上场和盘的会进来并一直留下。冷票保护只挡自动。
        </p>
        <p v-else-if="!displayRows.length" class="pod-follow-panel__hint">
          还没有跟单机会。对上足球板的场和盘才会进来，并标有没有下单。
        </p>
        <div v-else class="pod-follow-panel__list">
          <article
            v-for="row in displayRows"
            :key="row.log.id"
            class="pod-follow-row"
            :class="{
              'is-fresh': row.live && isFreshPodAlert(row.live.alert.alertedAt, nowTick),
              'is-jumpable': row.live ? row.live.fixtureMatch.status === 'matched' : !!row.log.obMid,
              'is-placed': isPlaced(row.log.id),
            }"
            :title="(row.live ? row.live.fixtureMatch.status === 'matched' : !!row.log.obMid) ? '点到板上这场' : undefined"
            @click="onDisplayClick(row)"
          >
            <template v-if="row.live">
              <div class="pod-follow-row__top">
                <span class="pod-follow-row__side">买 {{ row.pending.placed ? (row.log.sideLabel || row.live.sideLabel) : row.live.sideLabel }}</span>
                <span class="pod-follow-row__drop">{{ formatPodDropPct(row.pending.placed ? row.log.dropPct : row.live.dropPct) }}</span>
              </div>
              <div class="pod-follow-row__match">
                {{ row.pending.placed
                  ? `${row.log.home || row.live.alert.home} vs ${row.log.away || row.live.alert.away}`
                  : `${row.live.alert.home} vs ${row.live.alert.away}` }}
              </div>
              <div class="pod-follow-row__fixture" :class="`is-${row.live.fixtureMatch.status}`">
                {{ formatPodFixtureMatch(row.live.fixtureMatch) }}
              </div>
              <div
                v-if="row.live.fixtureMatch.status === 'matched'"
                class="pod-follow-row__market"
                :class="`is-${row.live.marketMatch.status}`"
              >
                {{ formatPodMarketMatch(row.live.marketMatch) }}
              </div>
              <div
                v-if="row.pending.placed || row.live.marketMatch.status === 'matched'"
                class="pod-follow-row__quote"
                :class="row.pending.placed ? 'is-ok' : `is-${row.live.obQuote.status}`"
              >
                <template v-if="row.pending.placed">
                  {{ formatPodFollowLogQuote(row.log) }}
                  <span class="pod-follow-row__ev">{{ formatPodFollowLogEv(row.log) }}</span>
                </template>
                <template v-else>
                  {{ formatPodObQuote(row.live.obQuote) }}
                  <span v-if="row.live.obQuote.evPercent" class="pod-follow-row__ev">
                    {{ formatPodEv(row.live.obQuote.evPercent) }}
                  </span>
                </template>
              </div>
              <div class="pod-follow-row__meta">
                <template v-if="row.pending.placed">
                  {{ row.log.league || row.live.alert.league }} · {{ row.log.marketLabel || row.live.marketLabel }}
                  <template v-if="row.log.pinPrevious > 1 && row.log.pinCurrent > 1">
                    · PIN {{ formatPodPrice(row.log.pinPrevious) }}→{{ formatPodPrice(row.log.pinCurrent) }}
                  </template>
                  · NVP {{ formatPodPrice(row.log.nvp) }}
                  · ≥{{ formatPodPrice(row.log.minObOdds) }}
                  <template v-if="row.log.maxObOdds">· ≤{{ formatPodPrice(row.log.maxObOdds) }}</template>
                </template>
                <template v-else>
                  {{ row.live.alert.league }} · {{ row.live.marketLabel }}
                  · PIN {{ formatPodPrice(row.live.pinPrevious) }}→{{ formatPodPrice(row.live.pinCurrent) }}
                  · NVP {{ formatPodPrice(row.live.nvp) }}
                  · ≥{{ formatPodPrice(row.live.minObOdds) }}
                  <template v-if="row.live.maxObOdds">· ≤{{ formatPodPrice(row.live.maxObOdds) }}</template>
                </template>
              </div>
              <div
                v-if="followV2.showDiagnostics"
                class="pod-follow-row__diag"
                :class="`is-${decisionShadowTone(row.live)}`"
                :title="decisionShadowTitle(row.live)"
              >
                诊断 {{ decisionShadowText(row.live) }}
              </div>
              <div class="pod-follow-row__foot">
                <div
                  class="pod-follow-row__status"
                  :class="`is-${row.pending.tone}`"
                  :title="row.pending.detail || undefined"
                >
                  <span class="pod-follow-row__status-lab">{{ row.pending.label }}</span>
                  <span
                    v-if="!row.pending.receipt && row.pending.detail"
                    class="pod-follow-row__status-detail"
                  >{{ row.pending.detail }}</span>
                </div>
                <span v-if="!row.pending.placed" class="pod-follow-row__foot-meta">
                  {{ formatEnabledVenueStakes() }}
                  · {{ formatPodKickoff(row.live.starts, nowTick) }}
                </span>
                <button
                  v-if="!isVenuePlaced(row.live.id, 'OB') && followObEnabled"
                  type="button"
                  class="pod-follow-row__place"
                  :disabled="!!placeBlock(row.live) || placingId === row.live.id"
                  :title="placeButtonTitle(row.live)"
                  @click="onPlaceClick($event, row.live)"
                >
                  {{ placeLabel(row.live) }}
                </button>
                <button
                  v-if="!isVenuePlaced(row.live.id, 'Polymarket') && followPmEnabled"
                  type="button"
                  class="pod-follow-row__place"
                  :disabled="!!pmPlaceBlock(row.live) || placingPmId === row.live.id"
                  :title="pmPlaceButtonTitle(row.live)"
                  @click="onPmPlaceClick($event, row.live)"
                >
                  {{ pmPlaceLabel(row.live) }}
                </button>
              </div>
              <div v-if="row.pending.receipt" class="pod-follow-row__receipt">
                <div class="pod-follow-row__receipt-line">
                  <span v-if="row.pending.receipt.clock" class="pod-follow-row__receipt-clock">
                    {{ row.pending.receipt.clock }}
                  </span>
                  <span v-if="row.pending.receipt.ago" class="pod-follow-row__receipt-ago">
                    {{ row.pending.receipt.ago }}
                  </span>
                  <span v-if="row.pending.receipt.pick">{{ row.pending.receipt.pick }}</span>
                </div>
                <div v-if="row.pending.receipt.match" class="pod-follow-row__receipt-match">
                  {{ row.pending.receipt.match }}
                </div>
                <div v-if="row.pending.receipt.accounts" class="pod-follow-row__receipt-acc">
                  {{ row.pending.receipt.accounts }}
                </div>
              </div>
            </template>
            <template v-else>
              <div class="pod-follow-row__top">
                <span class="pod-follow-row__side">买 {{ row.log.sideLabel }}</span>
                <span class="pod-follow-row__drop">{{ formatPodDropPct(row.log.dropPct) }}</span>
              </div>
              <div class="pod-follow-row__match">{{ row.log.home }} vs {{ row.log.away }}</div>
              <div class="pod-follow-row__quote" :class="row.pending.placed ? 'is-ok' : undefined">
                {{ formatPodFollowLogQuote(row.log) }}
                <span v-if="row.log.obQuote > 1" class="pod-follow-row__ev">
                  {{ formatPodFollowLogEv(row.log) }}
                </span>
              </div>
              <div class="pod-follow-row__meta">
                {{ row.log.league }} · {{ row.log.marketLabel }}
                <template v-if="row.log.pinPrevious > 1 && row.log.pinCurrent > 1">
                  · PIN {{ formatPodPrice(row.log.pinPrevious) }}→{{ formatPodPrice(row.log.pinCurrent) }}
                </template>
                · NVP {{ formatPodPrice(row.log.nvp) }}
                · ≥{{ formatPodPrice(row.log.minObOdds) }}
                <template v-if="row.log.maxObOdds">· ≤{{ formatPodPrice(row.log.maxObOdds) }}</template>
                · {{ formatPodFollowLogWhen(row.log.at, nowTick) }}
              </div>
              <div class="pod-follow-row__foot">
                <div
                  class="pod-follow-row__status"
                  :class="`is-${row.pending.tone}`"
                  :title="row.pending.detail || undefined"
                >
                  <span class="pod-follow-row__status-lab">{{ row.pending.label }}</span>
                  <span
                    v-if="!row.pending.receipt && row.pending.detail"
                    class="pod-follow-row__status-detail"
                  >{{ row.pending.detail }}</span>
                </div>
                <span v-if="!row.pending.placed" class="pod-follow-row__foot-meta">
                  {{ formatEnabledVenueStakes() }}
                </span>
              </div>
              <div v-if="row.pending.receipt" class="pod-follow-row__receipt">
                <div class="pod-follow-row__receipt-line">
                  <span v-if="row.pending.receipt.clock" class="pod-follow-row__receipt-clock">
                    {{ row.pending.receipt.clock }}
                  </span>
                  <span v-if="row.pending.receipt.ago" class="pod-follow-row__receipt-ago">
                    {{ row.pending.receipt.ago }}
                  </span>
                  <span v-if="row.pending.receipt.pick">{{ row.pending.receipt.pick }}</span>
                </div>
                <div v-if="row.pending.receipt.match" class="pod-follow-row__receipt-match">
                  {{ row.pending.receipt.match }}
                </div>
                <div v-if="row.pending.receipt.accounts" class="pod-follow-row__receipt-acc">
                  {{ row.pending.receipt.accounts }}
                </div>
              </div>
            </template>
          </article>
        </div>
      </template>
    </div>
    <button
      v-show="!collapsed"
      type="button"
      class="pod-follow-panel__resize"
      aria-label="缩放面板"
      @pointerdown="onResizePointerDown"
      @pointermove="onResizePointerMove"
      @pointerup="onResizePointerUp"
      @pointercancel="onResizePointerUp"
    />
  </div>
</template>

<style scoped>
.pod-follow-panel {
  position: fixed;
  z-index: 1890;
  display: flex;
  flex-direction: column;
  max-width: calc(100vw - 16px);
  color: #e8edf4;
  background: #14110ee6;
  border: 1px solid #f59e0b33;
  border-radius: 10px;
  box-shadow: 0 12px 40px #00000073;
  backdrop-filter: blur(10px);
  user-select: none;
  overflow: hidden;
}

.pod-follow-panel.is-dragging {
  opacity: 0.92;
}

.pod-follow-panel__header {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  flex: 0 0 40px;
  padding: 0 10px 0 12px;
  cursor: grab;
  border-bottom: 1px solid #ffffff14;
}

.pod-follow-panel.is-collapsed .pod-follow-panel__header {
  border-bottom: 0;
}

.pod-follow-panel__header:active {
  cursor: grabbing;
}

.pod-follow-panel__dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #ffffff66;
  flex-shrink: 0;
}

.pod-follow-panel__dot.is-ok {
  background: #f59e0b;
  box-shadow: 0 0 8px #f59e0bcc;
}

.pod-follow-panel__dot.is-wait {
  background: #e6a23c;
  box-shadow: 0 0 8px #e6a23ccc;
}

.pod-follow-panel__title {
  font-size: 13px;
  font-weight: 700;
}

.pod-follow-panel__status {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: #94a3b8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pod-follow-panel__btn {
  border: 0;
  background: transparent;
  color: #cbd5e1;
  font-size: 12px;
  cursor: pointer;
  padding: 4px 6px;
}

.pod-follow-panel__btn:hover {
  color: #fff;
}

.pod-follow-panel__summary {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  flex: 0 0 auto;
  min-height: 40px;
  padding: 6px 10px;
  border-bottom: 1px solid #ffffff14;
  font-size: 12px;
  color: #cbd5e1;
}

.pod-follow-panel__summary-label {
  flex-shrink: 0;
  font-weight: 600;
}

.pod-follow-panel__summary-text {
  color: #94a3b8;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pod-follow-panel__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}

.pod-follow-panel__toolbar {
  display: flex;
  justify-content: flex-end;
  flex: 0 0 auto;
  padding: 4px 6px 0;
}

.pod-follow-panel__hint {
  margin: 0;
  padding: 14px 14px 16px;
  font-size: 12px;
  line-height: 1.55;
  color: #cbd5e1;
}

.pod-follow-panel__list {
  display: flex;
  flex-direction: column;
}

.pod-follow-row {
  padding: 10px 12px;
  border-bottom: 1px solid #ffffff0f;
}

.pod-follow-row.is-fresh {
  background: #f59e0b14;
}

.pod-follow-row.is-jumpable {
  cursor: pointer;
}

.pod-follow-row.is-jumpable:hover {
  background: #f59e0b22;
}

.pod-follow-row__top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.pod-follow-row__side {
  min-width: 0;
  color: #fbbf24;
  font-size: 13px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pod-follow-row__drop {
  flex-shrink: 0;
  color: #4ade80;
  font-variant-numeric: tabular-nums;
  font-size: 12px;
  font-weight: 700;
}

.pod-follow-row__match {
  margin-top: 4px;
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pod-follow-row__fixture,
.pod-follow-row__market,
.pod-follow-row__quote,
.pod-follow-row__meta {
  margin-top: 4px;
  font-size: 11px;
  color: #94a3b8;
}

.pod-follow-row__fixture,
.pod-follow-row__market,
.pod-follow-row__quote {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pod-follow-row__diag {
  margin-top: 4px;
  font-size: 10px;
  color: #94a3b8;
  opacity: 0.78;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pod-follow-row__diag.is-ok {
  color: #86efac;
}

.pod-follow-row__diag.is-wait {
  color: #7dd3fc;
}

.pod-follow-row__diag.is-block {
  color: #fb923c;
}

.pod-follow-row__fixture.is-matched,
.pod-follow-row__market.is-matched,
.pod-follow-row__quote.is-ok {
  color: #fde68a;
}

.pod-follow-row__fixture.is-pending,
.pod-follow-row__market.is-skipped,
.pod-follow-row__quote.is-short,
.pod-follow-row__quote.is-spike {
  color: #fb923c;
}

.pod-follow-row__fixture.is-none,
.pod-follow-row__market.is-none,
.pod-follow-row__quote.is-none,
.pod-follow-row__quote.is-locked {
  color: #64748b;
}

.pod-follow-row__ev {
  margin-left: 6px;
}

.pod-follow-row__foot {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.pod-follow-row__status {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  max-width: 100%;
  min-width: 0;
  padding: 2px 8px;
  border-radius: 6px;
  border: 1px solid transparent;
  font-size: 11px;
  line-height: 1.35;
}

.pod-follow-row__status-lab {
  flex-shrink: 0;
  font-weight: 700;
}

.pod-follow-row__status-detail {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.92;
}

.pod-follow-row__status.is-ok {
  color: #86efac;
  background: #22c55e18;
  border-color: #22c55e44;
}

.pod-follow-row__status.is-ready {
  color: #fde68a;
  background: #f59e0b18;
  border-color: #f59e0b55;
}

.pod-follow-row__status.is-wait {
  color: #7dd3fc;
  background: #0ea5e918;
  border-color: #0ea5e944;
}

.pod-follow-row__status.is-block {
  color: #fdba74;
  background: #ea580c18;
  border-color: #ea580c44;
}

.pod-follow-row__status.is-idle {
  color: #94a3b8;
  background: #64748b18;
  border-color: #64748b44;
}

.pod-follow-row__foot-meta {
  color: #64748b;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.pod-follow-row.is-placed {
  background: #22c55e0c;
}

.pod-follow-row__receipt {
  margin-top: 6px;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid #22c55e33;
  background: #22c55e12;
  font-size: 11px;
  line-height: 1.4;
  color: #bbf7d0;
}

.pod-follow-row__receipt-line {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 10px;
  font-variant-numeric: tabular-nums;
}

.pod-follow-row__receipt-clock {
  font-weight: 700;
  color: #86efac;
}

.pod-follow-row__receipt-ago {
  color: #86efac99;
}

.pod-follow-row__receipt-match {
  margin-top: 2px;
  color: #e2e8f0;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pod-follow-row__receipt-acc {
  margin-top: 2px;
  color: #86efac;
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pod-follow-row__place {
  margin-left: auto;
  padding: 2px 8px;
  border: 1px solid #f59e0b99;
  border-radius: 999px;
  background: #f59e0b22;
  color: #fde68a;
  font-size: 11px;
  cursor: pointer;
}

.pod-follow-row__place:hover:not(:disabled) {
  background: #f59e0b44;
}

.pod-follow-row__place:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.pod-follow-panel__resize {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 0 0 10px 0;
  background:
    linear-gradient(135deg, transparent 0 55%, #ffffff55 55% 62%, transparent 62% 72%, #ffffff55 72% 79%, transparent 79%);
  cursor: nwse-resize;
}
</style>
