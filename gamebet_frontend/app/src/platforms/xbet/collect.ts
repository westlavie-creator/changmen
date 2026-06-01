import { startA8BetsCollector } from "@/platforms/shared/socket/collector";
import { PLATFORMS } from "@/shared/platform";
import { useMatchStore } from "@/stores/matchStore";
import type { PlatformScoreUpdate } from "@/types/matchScore";

/** 对齐 A8 KQe — A8 聚合频道 XBet（主客 suffix 1/3） */
export function startXbetCollector(): () => void {
  return startA8BetsCollector({
    platform: PLATFORMS.XBet,
    channel: "XBet",
    homeSuffix: "1",
    awaySuffix: "3",
    extraChannels: [
      {
        channel: "XBet:Score",
        onMessage: (msg) => {
          const rows = normalizeScorePayload(msg);
          if (rows.length) useMatchStore().updateScore(PLATFORMS.XBet, rows);
        },
      },
    ],
  });
}

function normalizeScorePayload(msg: unknown): PlatformScoreUpdate[] {
  if (Array.isArray(msg)) return msg as PlatformScoreUpdate[];
  if (msg && typeof msg === "object") return [msg as PlatformScoreUpdate];
  return [];
}
