import { currentOrderSoundUserName, loadOrderSoundPrefs } from "./prefs";
import { loadCustomOrderSoundBlob } from "./customStore";
import { playBuiltinPreset } from "./presets";

const DEBOUNCE_MS = 2000;

let audioCtx: AudioContext | null = null;
let unlocked = false;
const recentPlays = new Map<string, number>();

export function resetOrderSoundStateForTests() {
  audioCtx = null;
  unlocked = false;
  recentPlays.clear();
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

async function ensureAudioUnlocked() {
  if (typeof window === "undefined")
    return false;
  const Ctx = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx)
    return false;
  if (!audioCtx)
    audioCtx = new Ctx();
  if (audioCtx.state === "suspended")
    await audioCtx.resume();
  unlocked = true;
  return true;
}

async function playCustomBlob(blob: Blob, volume: number) {
  const url = URL.createObjectURL(blob);
  try {
    const audio = new Audio(url);
    audio.volume = Math.min(1, Math.max(0, volume));
    await audio.play();
  }
  finally {
    URL.revokeObjectURL(url);
  }
}

async function playPrefs(prefs: ReturnType<typeof loadOrderSoundPrefs>, force = false) {
  if (!force && !prefs.enabled)
    return;
  if (!(await ensureAudioUnlocked()))
    return;

  if (prefs.presetId === "custom") {
    if (!prefs.customSource || !prefs.customFileName)
      return;
    const userName = currentOrderSoundUserName();
    const blob = await loadCustomOrderSoundBlob(userName, prefs.customSource);
    if (!blob)
      return;
    await playCustomBlob(blob, prefs.volume);
    return;
  }

  if (!audioCtx)
    return;
  await playBuiltinPreset(audioCtx, prefs.presetId, prefs.volume);
}

/** 设置页「试听」：忽略 enabled 开关 */
export async function previewOrderSound(userName = currentOrderSoundUserName()) {
  const prefs = loadOrderSoundPrefs(userName);
  await playPrefs(prefs, true);
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

    await playPrefs(prefs);
  }
  catch {
    /* 浏览器自动播放策略等：静默 */
  }
}

export function isOrderSoundUnlocked() {
  return unlocked;
}
