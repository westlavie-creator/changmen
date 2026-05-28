import type { PlatformId } from "@/types/esport";

export type ScoreRound = {
  Home: number | string;
  Away: number | string;
};

export type MatchScoreBoard = {
  score: Map<number, ScoreRound>;
};

/** A8 `XBet:Score` 推送项 */
export type PlatformScoreUpdate = {
  SourceID?: string | number;
  Score?: Record<string, { Home?: number | string; Away?: number | string }>;
};

export type ScorePlatformPayload = {
  platform: PlatformId;
  rows: PlatformScoreUpdate[];
};
