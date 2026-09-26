/**
 * 板上对不上时，用采集会话热搜一场并拉列表盘。不进电竞 matcher。
 */
import { toViewMatches } from "@/models/match";
import {
  extractObSportSearchKeyword,
  OB_SPORT_HOT_SEARCH_PATH,
  parseObSportHotSearch,
  type ObSportSearchHit,
} from "@/runtime/obSportHotSearch";
import {
  fetchObFootballDtoByMid,
  getObSportPb,
} from "@/runtime/obSportFootballFetch";
import type { PodDropAlert } from "@/runtime/podAlerts";
import {
  fixtureFromViewMatch,
  matchPodAlertToFixtures,
  type PodBoardFixture,
} from "@/runtime/podFixtureMatch";
import { readLocalSportObSession } from "@/runtime/obSportSessionLocal";

const SEARCH_GAP_MS = 1_500;
const HIT_TTL_MS = 5 * 60_000;
const FAIL_TTL_MS = 30_000;

const hits = new Map<string, { at: number; fixture: PodBoardFixture }>();
const failed = new Map<string, number>();
const inflight = new Map<string, Promise<PodBoardFixture | null>>();
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
const attempts = new Map<string, number>();
let lastSearchAt = 0;
let searchQueue: Promise<void> = Promise.resolve();
let generation = 0;
let version = 0;
const listeners = new Set<() => void>();

function bump() {
  version += 1;
  for (const fn of listeners)
    fn();
}

export function subscribePodObMissSearch(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function podObMissSearchVersion(): number {
  return version;
}

export function listPodObMissFixtures(): PodBoardFixture[] {
  const now = Date.now();
  const out: PodBoardFixture[] = [];
  for (const [key, row] of hits) {
    if (now - row.at > HIT_TTL_MS) {
      hits.delete(key);
      continue;
    }
    out.push(row.fixture);
  }
  return out;
}

function alertKey(alert: Pick<PodDropAlert, "eventId" | "home" | "away" | "starts">): string {
  return [
    String(alert.eventId || "").trim(),
    String(alert.home || "").trim().toLowerCase(),
    String(alert.away || "").trim().toLowerCase(),
    String(alert.starts || ""),
  ].join("|");
}

function hitToFixture(hit: ObSportSearchHit): PodBoardFixture {
  return {
    id: Number(hit.mid) || 0,
    title: `${hit.home} vs ${hit.away}`,
    game: hit.league,
    startAt: hit.startTime || Date.now(),
    obMid: hit.mid,
    homeName: hit.home,
    awayName: hit.away,
    markets: [],
  };
}

async function searchKeyword(keyword: string): Promise<ObSportSearchHit[]> {
  const q = String(keyword || "").trim();
  if (q.length < 2)
    return [];
  let resolveRows!: (rows: ObSportSearchHit[]) => void;
  let rejectRows!: (reason?: unknown) => void;
  const result = new Promise<ObSportSearchHit[]>((resolve, reject) => {
    resolveRows = resolve;
    rejectRows = reject;
  });
  searchQueue = searchQueue.then(async () => {
    try {
      const session = readLocalSportObSession();
      if (!session?.token) {
        resolveRows([]);
        return;
      }
      const wait = SEARCH_GAP_MS - (Date.now() - lastSearchAt);
      if (wait > 0)
        await new Promise(resolve => setTimeout(resolve, wait));
      lastSearchAt = Date.now();
      const decoded = await getObSportPb(OB_SPORT_HOT_SEARCH_PATH, {
        keyword: q,
        cuid: String(session.sessionId || session.uid || "").replace(/\D/g, "").slice(0, 18) || "0",
        pageNumber: "1",
        rows: "80",
        isPc: "true",
        searchSportType: "1",
      }, session);
      resolveRows(parseObSportHotSearch(decoded));
    }
    catch (err) {
      rejectRows(err);
    }
  });
  return result;
}

function markFailed(
  key: string,
  alert: Pick<PodDropAlert, "eventId" | "home" | "away" | "starts" | "league">,
) {
  failed.set(key, Date.now());
  const count = (attempts.get(key) || 0) + 1;
  attempts.set(key, count);
  if (count >= 4 || retryTimers.has(key))
    return;
  const timer = setTimeout(() => {
    retryTimers.delete(key);
    failed.delete(key);
    void searchPodObMissFixture(alert);
  }, FAIL_TTL_MS);
  retryTimers.set(key, timer);
}

export function resetPodObMissSearch() {
  generation += 1;
  hits.clear();
  failed.clear();
  inflight.clear();
  attempts.clear();
  for (const timer of retryTimers.values())
    clearTimeout(timer);
  retryTimers.clear();
  lastSearchAt = 0;
  searchQueue = Promise.resolve();
  bump();
}

async function hydrate(hit: ObSportSearchHit): Promise<PodBoardFixture | null> {
  const dto = await fetchObFootballDtoByMid(hit.mid, {
    home: hit.home,
    away: hit.away,
    tid: hit.tid,
    tn: hit.league,
    startTime: hit.startTime,
  });
  if (!dto)
    return hitToFixture(hit);
  const view = toViewMatches([dto])[0];
  if (!view)
    return hitToFixture(hit);
  return fixtureFromViewMatch(view);
}

export async function searchPodObMissFixture(
  alert: Pick<PodDropAlert, "eventId" | "home" | "away" | "starts" | "league">,
): Promise<PodBoardFixture | null> {
  const key = alertKey(alert);
  const now = Date.now();
  const cached = hits.get(key);
  if (cached && now - cached.at < HIT_TTL_MS)
    return cached.fixture;
  const failAt = failed.get(key) || 0;
  if (now - failAt < FAIL_TTL_MS)
    return null;
  const pending = inflight.get(key);
  if (pending)
    return pending;
  const startedGeneration = generation;
  const work = (async () => {
    try {
      const homeKw = extractObSportSearchKeyword(alert.home);
      let rows = await searchKeyword(homeKw);
      if (startedGeneration !== generation)
        return null;
      if (!rows.length) {
        const awayKw = extractObSportSearchKeyword(alert.away);
        if (awayKw && awayKw !== homeKw)
          rows = await searchKeyword(awayKw);
        if (startedGeneration !== generation)
          return null;
      }
      if (!rows.length) {
        markFailed(key, alert);
        return null;
      }
      const fixtures = rows.map(hitToFixture);
      const matched = matchPodAlertToFixtures(alert, fixtures);
      if (matched.status !== "matched" || matched.basis !== "confirmed") {
        markFailed(key, alert);
        return null;
      }
      const hit = rows.find(row => row.mid === matched.hits[0]?.fixture.obMid);
      if (!hit) {
        markFailed(key, alert);
        return null;
      }
      const fixture = await hydrate(hit);
      if (startedGeneration !== generation)
        return null;
      if (!fixture) {
        markFailed(key, alert);
        return null;
      }
      hits.set(key, { at: Date.now(), fixture });
      failed.delete(key);
      attempts.delete(key);
      const retryTimer = retryTimers.get(key);
      if (retryTimer)
        clearTimeout(retryTimer);
      retryTimers.delete(key);
      bump();
      return fixture;
    }
    catch {
      markFailed(key, alert);
      return null;
    }
    finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, work);
  return work;
}
