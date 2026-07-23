import type { NotificationHandle } from "element-plus";
import { ElNotification } from "element-plus";
import { accountOrderDisplayName } from "@/shared/accountDisplayName";

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

function escapeNotifyText(raw: string): string {
  return String(raw ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 下单通知第一行：徽章 + 平台/场馆账号（venueAccountName 优先） */
export function bettingNotifyAccountLine(account: {
  provider?: string;
  platformName?: string;
  venueAccountName?: string;
  playerName?: string;
  accountId?: number;
}, platformLabel?: string): string {
  const platform = String(platformLabel || account.platformName || account.provider || "").trim() || "—";
  const name = accountOrderDisplayName(account) || "—";
  return `${platform} / ${name}`;
}

/** 下单通知顶栏：徽章在最前，后接账号行与可选状态后缀 */
export function bettingProviderHeadHtml(
  provider: string,
  accountLine: string,
  statusSuffix = "",
): string {
  const line = escapeNotifyText(accountLine);
  const status = statusSuffix ? ` ${escapeNotifyText(statusSuffix)}` : "";
  return [
    `<div class="notify-provider-head">`,
    `<span class="provider-icon ${escapeNotifyText(provider)}" aria-hidden="true"></span>`,
    `<span class="notify-account-line">${line}${status}</span>`,
    `</div>`,
  ].join("");
}

/** 对齐 A8 Io.betting loading 通知：平台角标 + 账号 + 详情 HTML */
export function bettingLoadingMessageHtml(
  provider: string,
  accountLine: string,
  detailHtml: string,
): string {
  return `${bettingProviderHeadHtml(provider, accountLine, "买入中...")}${detailHtml}`;
}

export function bettingResultMessageHtml(
  provider: string,
  accountLine: string,
  detailHtml: string,
  trailingHtml = "",
  statusSuffix = "",
): string {
  return `${bettingProviderHeadHtml(provider, accountLine, statusSuffix)}${detailHtml}${trailingHtml}`;
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
    `<p>买入：${option.target}，金额：${option.betMoney}@${option.odds}${countSuffix}</p>`,
  ].join("");
}
