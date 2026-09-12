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
};

export const POD_YABO_SETTINGS_DEFAULTS: PodYaboSettings = {
  maxObEdgePct: 18,
  spreadObEdgePct: 8,
  lineMatch: "strict",
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
  };
}
