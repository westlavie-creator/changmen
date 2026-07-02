import type { OrderSoundPresetId } from "./types";

function playTone(
  ctx: AudioContext,
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

/** 内置预设：Web Audio 合成，不依赖 mp3 资源 */
export async function playBuiltinPreset(
  ctx: AudioContext,
  presetId: Exclude<OrderSoundPresetId, "custom">,
  volume: number,
) {
  const t0 = ctx.currentTime + 0.02;
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
