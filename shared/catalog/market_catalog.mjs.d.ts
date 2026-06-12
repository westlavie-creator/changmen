export function getDefaultMarketCode(): string;
export function getPlatformRules(
  platform: string,
  marketCode?: string,
): Record<string, unknown> | null;
export function obMatchesOddTypeId(
  raw: Record<string, unknown>,
  rules: Record<string, unknown> | null,
  gameCode: string,
  round: number,
): boolean | null;
export function obLegacyWinBetName(betName: string): boolean;
export function iaLegacyWinBetName(betName: string): boolean;
