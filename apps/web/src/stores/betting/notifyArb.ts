/**
 * [changmen 扩展] 自动投注主循环（bettingStore.runTick）内的套利 Telegram 入口。
 * 与 A8 `Vg` 选腿/下单无关；在 config.betting 为 false 时也会执行。
 */
import { scanArbTelegramNotifications } from "@/shared/arbNotify";

/** runTick 已 fetchMatches + updateOdds 后调用；关闭 scan 内置节流以便每 tick 扫一次 */
export function notifyArbOpportunitiesOnBettingTick(): void {
  scanArbTelegramNotifications(0);
}
