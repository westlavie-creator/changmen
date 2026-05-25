import { startA8BetsCollector } from "@/collectors/a8Bets";
import { PLATFORMS } from "@/utils/platform";

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
          console.debug("[XBet] score", msg);
        },
      },
    ],
  });
}
