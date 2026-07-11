import { refreshFootballData } from "./gamma_fetch.js";
import { setFootballCache, setFootballCacheError, setFootballCacheRefreshing } from "./cache.js";

const POLL_MS = Number(process.env.FOOTBALL_POLL_MS) || 60_000;

let timer = null;
let running = false;

export async function refreshFootballOnce() {
  if (running)
    return false;
  running = true;
  setFootballCacheRefreshing(true);
  try {
    const { matches, leagues } = await refreshFootballData();
    setFootballCache(matches, leagues);
    console.log(`[changmen-football] refreshed matches=${matches.length} leagues=${leagues.length}`);
    return true;
  }
  catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setFootballCacheError(msg);
    console.error("[changmen-football] refresh failed:", msg);
    return false;
  }
  finally {
    running = false;
  }
}

export function startFootballLoop() {
  if (timer)
    return;
  void refreshFootballOnce();
  timer = setInterval(() => {
    void refreshFootballOnce();
  }, POLL_MS);
  if (typeof timer.unref === "function")
    timer.unref();
}

export function stopFootballLoop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
