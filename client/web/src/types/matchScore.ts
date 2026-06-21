import type { PlatformId } from "@/types/esport";

export interface ScoreRound {
  Home: number | string;
  Away: number | string;
}

export interface MatchScoreBoard {
  score: Map<number, ScoreRound>;
}

/** A8 `XBet:Score` 推送项 */
export interface PlatformScoreUpdate {
  SourceID?: string | number;
  Score?: Record<string, { Home?: number | string; Away?: number | string }>;
}

export interface ScorePlatformPayload {
  platform: PlatformId;
  rows: PlatformScoreUpdate[];
}
