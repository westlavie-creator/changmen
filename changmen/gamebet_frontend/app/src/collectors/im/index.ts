import { startA8BetsCollector } from "@/collectors/a8";
import { PLATFORMS } from "@/shared/platform";

/** 对齐 A8 EZe — A8 聚合 Socket.IO 频道 IM */
export function startImCollector(): () => void {
  return startA8BetsCollector({
    platform: PLATFORMS.IM,
    channel: "IM",
    homeSuffix: "1",
    awaySuffix: "2",
  });
}
