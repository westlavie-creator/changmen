const STORAGE_KEY = "changmen:footballFollowV2";

export type FootballFollowV2Settings = {
  enabled: boolean;
  showDiagnostics: boolean;
  useDecisionForDisplay: boolean;
  useDecisionForManualBlock: boolean;
  useQuoteV2: boolean;
  useDecisionForAuto: boolean;
};

export const FOOTBALL_FOLLOW_V2_DEFAULTS: FootballFollowV2Settings = {
  enabled: false,
  showDiagnostics: true,
  useDecisionForDisplay: false,
  useDecisionForManualBlock: false,
  useQuoteV2: false,
  useDecisionForAuto: false,
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function safeStorage(): StorageLike | null {
  try {
    return globalThis.localStorage || null;
  }
  catch {
    return null;
  }
}

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
}

function bool(raw: unknown, fallback: boolean): boolean {
  return typeof raw === "boolean" ? raw : fallback;
}

export function parseFootballFollowV2Settings(raw: unknown): FootballFollowV2Settings {
  const row = asRecord(raw);
  const d = FOOTBALL_FOLLOW_V2_DEFAULTS;
  return {
    enabled: bool(row.enabled, d.enabled),
    showDiagnostics: bool(row.showDiagnostics, d.showDiagnostics),
    useDecisionForDisplay: bool(row.useDecisionForDisplay, d.useDecisionForDisplay),
    useDecisionForManualBlock: bool(row.useDecisionForManualBlock, d.useDecisionForManualBlock),
    useQuoteV2: bool(row.useQuoteV2, d.useQuoteV2),
    useDecisionForAuto: bool(row.useDecisionForAuto, d.useDecisionForAuto),
  };
}

export function readFootballFollowV2Settings(storage: StorageLike | null = safeStorage()): FootballFollowV2Settings {
  if (!storage)
    return { ...FOOTBALL_FOLLOW_V2_DEFAULTS };
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw)
      return { ...FOOTBALL_FOLLOW_V2_DEFAULTS };
    return parseFootballFollowV2Settings(JSON.parse(raw));
  }
  catch {
    return { ...FOOTBALL_FOLLOW_V2_DEFAULTS };
  }
}

export function writeFootballFollowV2Settings(
  next: Partial<FootballFollowV2Settings>,
  storage: StorageLike | null = safeStorage(),
): FootballFollowV2Settings {
  const row = parseFootballFollowV2Settings({
    ...readFootballFollowV2Settings(storage),
    ...next,
  });
  if (!storage)
    return row;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(row));
  }
  catch { /* local only; ignore */ }
  return row;
}
