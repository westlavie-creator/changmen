import { getOrderSoundEngine } from "./engine";
import {
  currentOrderSoundUserName,
  loadOrderSoundPrefs,
  saveOrderSoundPrefs,
} from "./prefs";
import { migrateCustomOrderSoundHandleToBlob } from "./customStore";

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

/** 关闭设置页时用：不打断下单成功音 */
export async function stopOrderSoundPreview() {
  await getOrderSoundEngine().stopIfPreview();
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

/** 应用启动时调用：首次点击/按键解锁 AudioContext */
export function installOrderSoundAudioUnlock() {
  getOrderSoundEngine().installUnlockOnGesture();
}

/**
 * 把旧版 handle 迁成 IndexedDB blob，并把 prefs.customSource 写成 blob。
 * 设置页试听前应 allowPermissionPrompt=true。
 */
export async function ensureCustomOrderSoundMigrated(
  userName = currentOrderSoundUserName(),
  opts: { allowPermissionPrompt?: boolean } = {},
): Promise<boolean> {
  const prefs = loadOrderSoundPrefs(userName);
  if (prefs.presetId !== "custom")
    return true;
  const result = await migrateCustomOrderSoundHandleToBlob(userName, opts);
  if (!result.ok)
    return false;
  if (prefs.customSource !== "blob" || result.fileName) {
    saveOrderSoundPrefs({
      ...prefs,
      customSource: "blob",
      customFileName: result.fileName || prefs.customFileName,
    }, userName);
    clearOrderSoundCustomCache(userName);
  }
  return true;
}

/** 设置页「试听」：忽略 enabled；播放中再次调用则停止 */
export async function previewOrderSound(userName = currentOrderSoundUserName()) {
  const engine = getOrderSoundEngine();
  if (engine.isPlaying()) {
    await engine.stop();
    return null;
  }
  let prefs = loadOrderSoundPrefs(userName);
  if (prefs.presetId === "custom") {
    const ok = await ensureCustomOrderSoundMigrated(userName, { allowPermissionPrompt: true });
    if (!ok)
      throw new Error("无法播放自定义音频，请重新选择文件");
    prefs = loadOrderSoundPrefs(userName);
  }
  const session = await engine.play({ prefs, purpose: "preview", userName, force: true });
  if (!session && prefs.presetId === "custom")
    throw new Error("无法播放自定义音频，请重新选择文件");
  return session;
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

    if (prefs.presetId === "custom") {
      const ok = await ensureCustomOrderSoundMigrated(userName, { allowPermissionPrompt: false });
      if (!ok)
        return;
    }

    if (prefs.playMode === "debounced") {
      const dedupeKey = opts.betRowId != null && opts.betRowId !== ""
        ? String(opts.betRowId)
        : "global";
      if (!shouldPlayDebounced(dedupeKey))
        return;
    }

    await getOrderSoundEngine().play({
      prefs: loadOrderSoundPrefs(userName),
      purpose: "notify",
      userName,
    });
  }
  catch {
    /* 浏览器自动播放策略等：静默 */
  }
}

export function isOrderSoundUnlocked() {
  return getOrderSoundEngine().isUnlocked();
}
