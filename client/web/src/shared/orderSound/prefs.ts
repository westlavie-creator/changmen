import type { OrderSoundCustomSource, OrderSoundPlayMode, OrderSoundPrefs, OrderSoundPresetId } from "./types";
import { DEFAULT_ORDER_SOUND_PREFS } from "./types";

const STORAGE_VERSION = "v1";
const PREFIX = "gamebet:orderSound";

export function orderSoundStorageKey(userName: string) {
  const u = String(userName || "anonymous").trim() || "anonymous";
  return `${PREFIX}:${STORAGE_VERSION}:${u}`;
}

export function currentOrderSoundUserName() {
  if (typeof localStorage === "undefined")
    return "anonymous";
  return localStorage.getItem("app:userName")?.trim() || "anonymous";
}

function clampVolume(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n))
    return DEFAULT_ORDER_SOUND_PREFS.volume;
  return Math.min(1, Math.max(0, n));
}

function normalizePresetId(v: unknown): OrderSoundPresetId {
  if (v === "chime" || v === "bell" || v === "ding" || v === "custom")
    return v;
  return DEFAULT_ORDER_SOUND_PREFS.presetId;
}

function normalizePlayMode(v: unknown): OrderSoundPlayMode {
  if (v === "eachLeg" || v === "debounced")
    return v;
  return DEFAULT_ORDER_SOUND_PREFS.playMode;
}

function normalizeCustomSource(v: unknown): OrderSoundCustomSource | undefined {
  if (v === "blob" || v === "handle")
    return v;
  return undefined;
}

export function normalizeOrderSoundPrefs(raw: unknown): OrderSoundPrefs {
  const src = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const customFileName = src.customFileName != null && String(src.customFileName).trim()
    ? String(src.customFileName).trim()
    : undefined;
  const customSource = normalizeCustomSource(src.customSource);
  return {
    enabled: src.enabled === true,
    presetId: normalizePresetId(src.presetId),
    volume: clampVolume(src.volume),
    playMode: normalizePlayMode(src.playMode),
    customFileName: customSource ? customFileName : undefined,
    customSource: customSource && customFileName ? customSource : undefined,
  };
}

export function loadOrderSoundPrefs(userName = currentOrderSoundUserName()): OrderSoundPrefs {
  if (typeof localStorage === "undefined")
    return { ...DEFAULT_ORDER_SOUND_PREFS };
  try {
    const raw = localStorage.getItem(orderSoundStorageKey(userName));
    if (!raw)
      return { ...DEFAULT_ORDER_SOUND_PREFS };
    return normalizeOrderSoundPrefs(JSON.parse(raw));
  }
  catch {
    return { ...DEFAULT_ORDER_SOUND_PREFS };
  }
}

export function saveOrderSoundPrefs(prefs: OrderSoundPrefs, userName = currentOrderSoundUserName()) {
  if (typeof localStorage === "undefined")
    return;
  const normalized = normalizeOrderSoundPrefs(prefs);
  localStorage.setItem(orderSoundStorageKey(userName), JSON.stringify(normalized));
}
