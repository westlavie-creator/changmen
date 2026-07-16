/** 对调 Source 主客侧（不依赖 match-engine merge） */
export function swapBetSource(src) {
  if (!src || typeof src !== "object")
    return src;
  return {
    ...src,
    HomeID: src.AwayID,
    AwayID: src.HomeID,
    HomeOdds: src.AwayOdds,
    AwayOdds: src.HomeOdds,
  };
}
