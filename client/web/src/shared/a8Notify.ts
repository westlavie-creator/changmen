import type { NotificationHandle } from "element-plus";
import { ElNotification } from "element-plus";

/** 对齐 A8 bundle `Pr.tip`：Element 通知 + 可选 countdown 倒计时 */
export function a8Tip(title: string, message: string, durationMs = 3000): NotificationHandle {
  const endAt = Date.now() + durationMs;
  let html = message;
  let countdownId: string | undefined;

  if (/<countdown>/.test(message)) {
    countdownId = `countdown-${endAt}`;
    html = message.replace("<countdown>", `<countdown id="${countdownId}">`);
  }

  const duration = durationMs === 0 ? 3000 : durationMs;
  const handle = ElNotification({
    title,
    message: html,
    type: "info",
    duration,
    dangerouslyUseHTMLString: true,
  });

  if (countdownId) {
    const timer = window.setInterval(() => {
      const left = Math.round((endAt - Date.now()) / 1000);
      const el = document.getElementById(countdownId!);
      if (left < 0 || !el) {
        window.clearInterval(timer);
        return;
      }
      el.textContent = String(left);
    }, 1000);
  }

  return handle;
}

/** 对齐 A8 Io.betting loading 通知：平台角标 + 详情 HTML */
export function bettingLoadingMessageHtml(provider: string, detailHtml: string): string {
  return `<div class="notify-loading-head"><div class="provider-icon ${provider}" aria-hidden="true"></div></div>${detailHtml}`;
}

export function bettingDetailHtml(option: {
  matchTitle?: string;
  betName?: string;
  target: string;
  itemOdds?: number;
  betMoney: number;
  odds: number;
  betCount?: number;
}): string {
  const countSuffix = option.betCount != null ? ` / ${option.betCount}次` : "";
  return [
    `<p>赛事：${option.matchTitle ?? ""} / ${option.betName ?? ""} / ${option.target}@${option.itemOdds ?? option.odds}</p>`,
    `<p>投注：${option.target}，金额：${option.betMoney}@${option.odds}${countSuffix}</p>`,
  ].join("");
}
