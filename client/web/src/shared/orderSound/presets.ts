import type { OrderSoundPresetId } from "./types";

function playTone(
  ctx: BaseAudioContext,
  {
    frequency,
    startAt,
    duration,
    volume,
    type = "sine",
  }: {
    frequency: number;
    startAt: number;
    duration: number;
    volume: number;
    type?: OscillatorType;
  },
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(Math.max(volume, 0.0001), startAt + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
}

const BUILTIN_DURATION_SEC: Record<Exclude<OrderSoundPresetId, "custom">, number> = {
  chime: 0.35,
  bell: 0.9,
  ding: 0.15,
};

/** 在任意 AudioContext / OfflineAudioContext 上调度内置预设（音量在渲染阶段烘焙进 buffer） */
export function scheduleBuiltinPreset(
  ctx: BaseAudioContext,
  presetId: Exclude<OrderSoundPresetId, "custom">,
  volume: number,
  startOffset = 0.02,
) {
  const t0 = startOffset;
  const v = Math.min(1, Math.max(0, volume));
  if (presetId === "chime") {
    playTone(ctx, { frequency: 880, startAt: t0, duration: 0.12, volume: v * 0.35 });
    playTone(ctx, { frequency: 1175, startAt: t0 + 0.1, duration: 0.18, volume: v * 0.4 });
    return;
  }
  if (presetId === "bell") {
    playTone(ctx, { frequency: 660, startAt: t0, duration: 0.55, volume: v * 0.45, type: "triangle" });
    playTone(ctx, { frequency: 990, startAt: t0, duration: 0.35, volume: v * 0.2, type: "sine" });
    return;
  }
  playTone(ctx, { frequency: 1200, startAt: t0, duration: 0.09, volume: v * 0.5, type: "square" });
}

/** 离线渲染内置预设为 AudioBuffer，供统一播放引擎缓存 */
export async function renderBuiltinPresetBuffer(
  presetId: Exclude<OrderSoundPresetId, "custom">,
  volume = 1,
): Promise<AudioBuffer> {
  const duration = BUILTIN_DURATION_SEC[presetId];
  const sampleRate = 44100;
  const offline = new OfflineAudioContext(1, Math.ceil(sampleRate * duration), sampleRate);
  scheduleBuiltinPreset(offline, presetId, volume);
  return offline.startRendering();
}
