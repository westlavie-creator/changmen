/**
 * AutoYabo 决策字段。仍写在 changmen:podBetSettings 同一份 JSON 里，避免两套开关。
 */
export type PodYaboLineMatch = "strict" | "loose";

export type PodYaboSettings = {
  /**
   * EV 上限 %。OB/NVP-1 超过则当异常（错场/错盘/假边），不下。
   * 0 = 不封顶。对齐 AutoYabo maxAllowedPositiveEvPercent=18。
   */
  maxObEdgePct: number;
  /** 让球单独的 EV 下限 %。默认比大小高。 */
  spreadObEdgePct: number;
  /**
   * strict = 只对警报同一档；loose = 允许邻档，但必须用该档自己的 NVP。
   * 没有逐档 NVP 时 loose 也不会拿警报 NVP 去套隔壁档。
   */
  lineMatch: PodYaboLineMatch;
  /** AutoYabo 随机注额步长；0 = 固定使用场馆金额。 */
  stakeRandomStep: number;
  /** AutoYabo 随机注额层数；0 = 固定使用场馆金额。 */
  stakeRandomLevels: number;
};

export const POD_YABO_SETTINGS_DEFAULTS: PodYaboSettings = {
  maxObEdgePct: 18,
  spreadObEdgePct: 8,
  lineMatch: "strict",
  stakeRandomStep: 0,
  stakeRandomLevels: 0,
};

function clampNum(v: unknown, fallback: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n))
    return fallback;
  return Math.min(max, Math.max(min, n));
}

export function parsePodYaboSettings(raw: unknown): PodYaboSettings {
  const row = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  const d = POD_YABO_SETTINGS_DEFAULTS;
  return {
    maxObEdgePct: clampNum(row.maxObEdgePct, d.maxObEdgePct, 0, 80),
    spreadObEdgePct: clampNum(row.spreadObEdgePct, d.spreadObEdgePct, 0, 40),
    lineMatch: row.lineMatch === "loose" ? "loose" : "strict",
    stakeRandomStep: clampNum(row.stakeRandomStep, d.stakeRandomStep, 0, 1_000_000),
    stakeRandomLevels: Math.round(clampNum(row.stakeRandomLevels, d.stakeRandomLevels, 0, 20)),
  };
}

export function resolvePodYaboStake(
  baseStake: number,
  settings: Pick<PodYaboSettings, "stakeRandomStep" | "stakeRandomLevels">,
  random = Math.random,
): number {
  const base = Number(baseStake);
  if (!(base > 0))
    return 0;
  const step = Number(settings.stakeRandomStep) || 0;
  const levels = Math.round(Number(settings.stakeRandomLevels) || 0);
  if (!(step > 0) || !(levels > 0))
    return base;
  const span = levels * 2 + 1;
  const offset = Math.floor(Math.min(0.999999, Math.max(0, random())) * span) - levels;
  const next = Math.round((base + offset * step) * 100) / 100;
  return next > 0 ? next : base;
}
