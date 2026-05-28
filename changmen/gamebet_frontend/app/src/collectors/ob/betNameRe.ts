let cachedPattern: string | undefined;
let cachedRe: RegExp | undefined;

/** 缓存 platform.BetName 对应正则，避免每轮 new RegExp */
export function getObBetNameRe(betName: string | undefined): RegExp {
  const pattern = betName || ".*";
  if (cachedPattern === pattern && cachedRe) {
    return cachedRe;
  }
  cachedPattern = pattern;
  cachedRe = new RegExp(pattern);
  return cachedRe;
}
