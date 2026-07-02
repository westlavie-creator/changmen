/** 内置预设（Web Audio 合成，无需静态资源） */
export type OrderSoundPresetId = "chime" | "bell" | "ding" | "custom";

export type OrderSoundPlayMode = "eachLeg" | "debounced";

export type OrderSoundCustomSource = "blob" | "handle";

export interface OrderSoundPrefs {
  enabled: boolean;
  presetId: OrderSoundPresetId;
  volume: number;
  playMode: OrderSoundPlayMode;
  /** 仅 presetId === 'custom'；展示用文件名 */
  customFileName?: string;
  /** blob=IndexedDB 副本；handle=File System Access 句柄（大文件友好） */
  customSource?: OrderSoundCustomSource;
}

export const DEFAULT_ORDER_SOUND_PREFS: OrderSoundPrefs = {
  enabled: false,
  presetId: "chime",
  volume: 0.7,
  playMode: "debounced",
};

export const ORDER_SOUND_PRESET_LABELS: Record<Exclude<OrderSoundPresetId, "custom">, string> = {
  chime: "清脆双音",
  bell: "铃声",
  ding: "短促提示",
};

export const ORDER_SOUND_PLAY_MODE_LABELS: Record<OrderSoundPlayMode, string> = {
  debounced: "同一盘口合并（2 秒内只响一次）",
  eachLeg: "每腿成功各响一次",
};
