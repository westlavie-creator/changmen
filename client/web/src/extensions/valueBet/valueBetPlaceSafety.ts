/**
 * [changmen 扩展] 正 EV 落单前闸门（扫描后再核一次，避免确认框/预检期间条件已变仍下出）。
 */

export type ValueBetPlaceBlock =
  | "amount"
  | "muted"
  | "map_limit"
  | "odds_range"
  | "edge";

export interface ValueBetPlaceSafetyInput {
  amount: number;
  edge: number;
  minEdge: number;
  maxEdge?: number;
  muted?: boolean;
  checkMute?: boolean;
  mapCount?: number;
  maxPerMap?: number;
  checkMapLimit?: boolean;
  sharpOdds?: number;
  minOdds?: number;
  maxOdds?: number;
  checkOddsRange?: boolean;
}

export function evaluateValueBetPlaceSafety(input: ValueBetPlaceSafetyInput): ValueBetPlaceBlock | null {
  if (!(Number.isFinite(input.amount) && input.amount > 0))
    return "amount";
  if (!(Number.isFinite(input.minEdge) && Number.isFinite(input.edge) && input.edge >= input.minEdge))
    return "edge";
  const maxEdge = input.maxEdge;
  if (maxEdge != null && Number.isFinite(maxEdge) && input.edge > maxEdge)
    return "edge";
  if (input.checkMute && input.muted)
    return "muted";
  if (input.checkMapLimit) {
    const maxPerMap = input.maxPerMap;
    const mapCount = input.mapCount ?? 0;
    if (maxPerMap == null || !Number.isFinite(maxPerMap) || maxPerMap < 1 || mapCount >= maxPerMap)
      return "map_limit";
  }
  if (input.checkOddsRange) {
    const { sharpOdds, minOdds, maxOdds } = input;
    if (
      !Number.isFinite(sharpOdds)
      || !Number.isFinite(minOdds)
      || !Number.isFinite(maxOdds)
      || sharpOdds! < minOdds!
      || sharpOdds! > maxOdds!
    )
      return "odds_range";
  }
  return null;
}
