/**
 * Value-bet 引擎配置 — 所有可调参数集中在此。
 */

export const SHARP_PLATFORM = process.env.VB_SHARP_PLATFORM || "PB";

export const SCAN_INTERVAL_MS = Number(process.env.VB_SCAN_INTERVAL_MS || 15_000);

export const MIN_EDGE = Number(process.env.VB_MIN_EDGE || 0.03);

export const MAX_EDGE = Number(process.env.VB_MAX_EDGE || 0.30);

export const MIN_ODDS = Number(process.env.VB_MIN_ODDS || 1.40);

export const MAX_ODDS = Number(process.env.VB_MAX_ODDS || 5.00);

export const KELLY_MULTIPLIER = Number(process.env.VB_KELLY_MULTIPLIER || 0.25);

export const MAX_SIGNAL_AGE_MS = Number(process.env.VB_MAX_SIGNAL_AGE_MS || 5 * 60_000);

export const SOFT_PLATFORMS = (process.env.VB_SOFT_PLATFORMS || "OB,IM,RAY,TF,IA,SABA,IMT,HG")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const VIG_REMOVAL_METHOD = process.env.VB_VIG_METHOD || "multiplicative";
