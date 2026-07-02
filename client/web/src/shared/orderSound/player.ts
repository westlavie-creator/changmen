import { getOrderSoundEngine } from "./engine";
import { currentOrderSoundUserName, loadOrderSoundPrefs } from "./prefs";

const DEBOUNCE_MS = 2000;
const recentPlays = new Map<string, number>();

export function subscribeOrderSoundState(listener: () => void) {
  return getOrderSoundEngine().subscribe(listener);
}

export function isOrderSoundPlaying() {
  return getOrderSoundEngine().isPlaying();
}

export async function stopOrderSound() {
  await getOrderSoundEngine().stop();
}

export function resetOrderSoundStateForTests() {
  getOrderSoundEngine().resetForTests();
  recentPlays.clear();
}

export function clearOrderSoundCustomCache(userName?: string) {
  getOrderSoundEngine().clearCustomBufferCache(userName);
}

export function shouldPlayDebounced(dedupeKey: string, now = Date.now()) {
  const key = String(dedupeKey || "").trim();
  if (!key)
    return true;
  const last = recentPlays.get(key);
  if (last != null && now - last < DEBOUNCE_MS)
    return false;
  recentPlays.set(key, now);
  return true;
}

/** 设置页「试听」：忽略 enabled；播放中再次调用则停止 */
export async function previewOrderSound(userName = currentOrderSoundUserName()) {
  const engine = getOrderSoundEngine();
  if (engine.isPlaying()) {
    await engine.stop();
    return null;
  }
  const prefs = loadOrderSoundPrefs(userName);
  return engine.play({ prefs, purpose: "preview", userName, force: true });
}

export interface PlayOrderSuccessSoundOpts {
  betRowId?: string | number;
  userName?: string;
}

/** 下单成功时调用；失败静默，不干扰投注流程 */
export async function playOrderSuccessSound(opts: PlayOrderSuccessSoundOpts = {}) {
  try {
    const userName = opts.userName ?? currentOrderSoundUserName();
    const prefs = loadOrderSoundPrefs(userName);
    if (!prefs.enabled)
      return;

    if (prefs.playMode === "debounced") {
      const dedupeKey = opts.betRowId != null && opts.betRowId !== ""
        ? String(opts.betRowId)
        : "global";
      if (!shouldPlayDebounced(dedupeKey))
        return;
    }

    await getOrderSoundEngine().play({ prefs, purpose: "notify", userName });
  }
  catch {
    /* 浏览器自动播放策略等：静默 */
  }
}

export function isOrderSoundUnlocked() {
  return getOrderSoundEngine().isUnlocked();
}
