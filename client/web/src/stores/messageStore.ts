import { defineStore } from "pinia";
import { sendMessage } from "@/api/esport";
import type { ArbFlowPayload } from "@/extensions/arbBet/betTrace";
import { formatArbFlowTelegramBody } from "@/extensions/arbBet/betTrace";
import {
  clearOpportunityPending,
  clearOpportunityPendingFromTraceId,
} from "@/extensions/arbBet/arbOpportunityLink";
import type { ArbOpportunityNotifyMeta } from "@/extensions/arbBet/telegramMessage";
import type { ArbLegs } from "@/domain/arbitrage/pickArbLegs";
import type { ViewBet, ViewMatch } from "@/models/match";
import type { ArbOrderEligibility } from "@/extensions/arbBet/eligibility";
import {
  assessValueBet,
  formatValueBetTelegramLine,
} from "@/extensions/arbBet/valueBet";
import { arbProfitRate, formatDate, formatDateKey, percent, toFixed } from "@/shared/format";
import { isA8StrictMode } from "@/shared/a8Strict";
import { NOTIFY_TYPES } from "@/types/notifyTypes";
import type { BetOption } from "@/models/betOption";
import type { BetResult } from "@/models/betResult";
import type { LoseOrder } from "@/models/loseOrder";
import type { PlatformAccount } from "@/models/platformAccount";
import type { OrderRow } from "@/types/order";
import { useUserStore } from "@/stores/userStore";
import { useConfigStore } from "@/stores/configStore";
import { wait } from "@/shared/wait";

/** A8 bundle 固定报表群 / 发布群（Gi 中 RBe / FBe） */
const REPORT_CHAT_ID = "-1001949068832";
const PUBLISH_CHAT_ID = "-4855267884";
const DEDUP_PREFIX = "MSG_DEDUP:";

export interface BettingMessageLeg {
  account: PlatformAccount;
  result: BetResult;
  options: BetOption;
  reject?: boolean;
}

function htmlTitle(text: string, urgent = false) {
  return urgent ? `<b>🔴 ${text}</b>` : `<b>${text}</b>`;
}

/** 对齐 A8 `Gi.send` 的 `l`：下单类标题前缀 📣 + 双腿状态 */
function orderHtmlTitle(text: string, legStatus = "📣📣") {
  return `<b>📣${legStatus}${text}</b>`;
}

/** 对齐 A8 `Gi.send` 的 `d`：单腿成功/失败/拒单 */
function orderLegStatusEmoji(success?: boolean, rejected?: boolean) {
  if (rejected) return "🔴";
  return success ? "✅" : "❌";
}

function accountLine(acc: PlatformAccount) {
  return `${acc.platformName || acc.provider} / ${acc.playerName}`;
}

/** 对齐 A8 `Gi.send` 账号摘要行（含余额） */
function balanceAccountLine(acc: PlatformAccount) {
  const user = useUserStore();
  return `#${user.userName} ${acc.platformName || acc.provider}，账号：${acc.playerName}，余额：${toFixed(acc.balance ?? 0, 0).toLocaleString()}，场馆：${acc.provider}`;
}

function profitEmoji(n: number) {
  return n >= 0 ? "🟢" : "🔴";
}

/** 对齐 A8 Pinia `Gi`：Telegram 推送队列 + 去重 */
export const useMessageStore = defineStore("message", {
  state: () => ({
    running: false,
    telegramQueue: [] as string[],
    pushQueue: [] as string[],
    reportQueue: [] as string[],
    publishQueue: [] as string[],
  }),

  actions: {
    start() {
      if (this.running) return;
      this.running = true;
      void this.runLoop();
    },

    stop() {
      this.running = false;
    },

    async runLoop() {
      while (this.running) {
        try {
          const user = useUserStore();
          const cfg = user.message;
          const telegram = this.telegramQueue.pop();
          if (telegram && cfg.telegramId) {
            await this.deliver(cfg.telegramId, telegram);
          }
          const push = this.pushQueue.pop();
          if (push && cfg.pushOrderId) {
            await this.deliver(cfg.pushOrderId, push);
          }
          const report = this.reportQueue.pop();
          if (report) await this.deliver(REPORT_CHAT_ID, report);
          const publish = this.publishQueue.pop();
          if (publish) await this.deliver(PUBLISH_CHAT_ID, publish);
        } catch (err) {
          console.error("[messageStore]", err);
        }
        await wait(1000);
      }
    },

    async deliver(chatIds: string, text: string) {
      const ids = chatIds
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      await Promise.all(
        ids.map((chat_id) =>
          sendMessage({ chat_id, text, parse_mode: "HTML" }).catch(() => false),
        ),
      );
    },

    /** typeIndex 对应 NOTIFY_TYPES；cooldownSec=0 表示不去重 */
    shouldNotify(typeIndex: number, key: string, cooldownSec = 1800) {
      if (cooldownSec === 0) return true;
      const storageKey = `${DEDUP_PREFIX}${typeIndex}:${key}`;
      const last = Number(sessionStorage.getItem(storageKey) || 0);
      if (Date.now() - last < cooldownSec * 1000) return false;
      sessionStorage.setItem(storageKey, String(Date.now()));
      return true;
    },

    enqueueTelegram(text: string) {
      this.telegramQueue.push(text);
    },

    enqueuePush(text: string) {
      this.pushQueue.push(text);
    },

    /** 对齐 A8 `Gi.send.BalanceMessage`：余额 ≥ maxBalance 时 Telegram 提醒 */
    balanceMessage(account: PlatformAccount, cooldownSec = 1800) {
      if (!account.maxBalance || (account.balance ?? 0) < account.maxBalance) return;
      const idx = NOTIFY_TYPES.indexOf("Balance");
      if (!this.shouldNotify(idx, String(account.accountId), cooldownSec)) return;
      const body = [
        htmlTitle("余额超限提醒"),
        balanceAccountLine(account),
        `<blockquote>当前余额：${(account.balance ?? 0).toLocaleString()}，大于设定值：${account.maxBalance.toLocaleString()}</blockquote>`,
      ].join("\n");
      this.enqueueTelegram(body);
    },

    /** 对齐 A8 `Gi.send.ProfitMessage`：totalProfit ≥ maxProfit 时 Telegram 提醒 */
    profitMessage(account: PlatformAccount, cooldownSec = 1800) {
      if (
        !account.maxProfit ||
        !account.totalProfit ||
        account.totalProfit < account.maxProfit ||
        account.pause
      ) {
        return;
      }
      const idx = NOTIFY_TYPES.indexOf("Profit");
      if (!this.shouldNotify(idx, String(account.accountId), cooldownSec)) return;
      const body = [
        htmlTitle("账号盈利超过预设值"),
        balanceAccountLine(account),
        `<blockquote>当前盈利：${account.totalProfit.toLocaleString()}，大于设定值：${account.maxProfit.toLocaleString()}</blockquote>`,
      ].join("\n");
      this.enqueueTelegram(body);
    },

    collectMessage(platform: string, detail: string) {
      const idx = NOTIFY_TYPES.indexOf("Balance");
      if (!this.shouldNotify(idx, platform, 600)) return;
      const body = [
        htmlTitle(`${platform} 本地采集发生错误`),
        `<blockquote>${detail}</blockquote>`,
      ].join("\n");
      this.enqueueTelegram(body);
    },

    /**
     * [changmen 扩展] 套利机会雷达（原 telegramMessage）；严格 A8 模式不发送。
     * @returns 是否实际入队（去重通过）
     */
    arbOpportunityMessage(
      match: ViewMatch,
      bet: ViewBet,
      legs: ArbLegs,
      eligibility: ArbOrderEligibility,
      meta: ArbOpportunityNotifyMeta,
    ): boolean {
      if (isA8StrictMode()) return false;
      const user = useUserStore();
      if (!user.message?.telegramId?.trim()) return false;

      const idx = NOTIFY_TYPES.indexOf("OrderNotify");
      const key = `${match.id}:${bet.id}:${legs.homeItem.type}:${legs.awayItem.type}`;
      if (!this.shouldNotify(idx, key, 600)) return false;

      const value = assessValueBet(bet.id, legs);
      const statusLine = eligibility.canOrder
        ? "🟢 <b>可自动下单</b>"
        : "🔴 <b>无法自动下单</b>";
      const reasonLines = eligibility.canOrder
        ? eligibility.reasons.map((r) => `⚠️ ${r}`)
        : eligibility.reasons.map((r) => `• ${r}`);
      const autoPlatforms =
        meta.autoProviderKeys.length > 0
          ? meta.autoProviderKeys.join(", ")
          : "（无有余额账号平台）";
      const autoLegLine = meta.autoLegs
        ? `执行腿赔率：${meta.autoLegs.homeItem.type} @ ${meta.autoLegs.homeOdds} | ${meta.autoLegs.awayItem.type} @ ${meta.autoLegs.awayOdds}`
        : "执行腿：auto 平台当前无套利";
      const body = [
        htmlTitle("套利机会"),
        match.title,
        bet.getBetName(),
        statusLine,
        ...reasonLines,
        `<i>展示腿（全盘口）：${legs.homeItem.type} @ ${legs.homeOdds} / ${legs.awayItem.type} @ ${legs.awayOdds}</i>`,
        `<i>执行平台（有余额账号）：${autoPlatforms}</i>`,
        `<i>${autoLegLine}</i>`,
        "<blockquote>",
        `${legs.homeItem.type} 主胜 @ ${legs.homeOdds}`,
        `${legs.awayItem.type} 客胜 @ ${legs.awayOdds}`,
        `对冲 ${percent(legs.implied)} / 利润 ${arbProfitRate(legs.implied)}`,
        formatValueBetTelegramLine(value),
        "</blockquote>",
      ].join("\n");
      this.enqueueTelegram(body);
      return true;
    },

    /**
     * [changmen 扩展] 可自动下单机会发出后，同轮执行无其它推送时的续报。
     */
    arbExecutionFollowUpMessage(match: ViewMatch, bet: ViewBet, summary: string) {
      if (isA8StrictMode()) return;
      const user = useUserStore();
      if (!user.message?.telegramId?.trim()) return;

      clearOpportunityPending(match.id, bet.id);

      const idx = NOTIFY_TYPES.indexOf("ArbFlow");
      const key = `${match.id}:${bet.id}:followup:${summary}`;
      if (!this.shouldNotify(idx, key, 120)) return;

      const body = [
        htmlTitle("套利执行续报"),
        `${match.title} / ${bet.getBetName()}`,
        `<i>${summary}</i>`,
      ].join("\n");
      this.enqueueTelegram(body);
    },

    /**
     * [changmen 扩展] 套利执行链路摘要；严格 A8 模式不发送。
     * 成功双腿仍由 A8 对齐的 `bettingMessage` 负责。
     */
    arbFlowMessage(payload: ArbFlowPayload) {
      if (isA8StrictMode()) return;
      const user = useUserStore();
      if (!user.message?.telegramId?.trim()) return;

      clearOpportunityPendingFromTraceId(payload.id);

      const idx = NOTIFY_TYPES.indexOf("ArbFlow");
      const cooldown =
        payload.outcome === "fail" ? 120 : payload.outcome === "skip" ? 300 : 600;
      const key = `${payload.matchTitle}:${payload.betName}:${payload.outcome}:${payload.summary}`;
      if (!this.shouldNotify(idx, key, cooldown)) return;
      this.enqueueTelegram(formatArbFlowTelegramBody(payload));
    },

    /** 对齐 A8 `Gi.send.LimitMessage`：入队 Telegram 并返回 HTML 文案供 checkError */
    limitMessage(
      account: PlatformAccount,
      payload: {
        match?: string;
        bet?: string;
        odds: number;
        betMoney: number;
        limit: number;
      },
    ): string {
      const body = [
        htmlTitle("限红提醒"),
        accountLine(account),
        `<blockquote>${payload.match ?? ""} / ${payload.bet ?? ""}`,
        `投注金额：${payload.betMoney}@${payload.odds}`,
        `限红金额：${payload.limit}</blockquote>`,
      ].join("\n");
      this.enqueueTelegram(body);
      return body;
    },

    /** [A8 可证实] `Gi.send.DelayMessage`：耗时 ≥2s 时 Telegram 延迟提醒 */
    delayMessage(account: PlatformAccount, elapsedMs: number) {
      if (elapsedMs < 2000) return;
      const body = [
        htmlTitle("注单延迟收单提醒"),
        balanceAccountLine(account),
        `<blockquote>投注延迟：${toFixed(elapsedMs / 1000, 1)}秒</blockquote>`,
      ].join("\n");
      this.enqueueTelegram(body);
    },

    hgFollowMessage(
      account: PlatformAccount,
      tid: string,
      detail: string,
      success: boolean,
    ) {
      const key = `HG:${tid}:${success ? "ok" : "fail"}`;
      const idx = NOTIFY_TYPES.indexOf("Balance");
      if (!this.shouldNotify(idx, key, success ? 3600 : 300)) return;
      const body = [
        htmlTitle(`HG 跟单${success ? "成功" : "失败"}`, !success),
        accountLine(account),
        `<blockquote>TID: ${tid}\n${detail}</blockquote>`,
      ].join("\n");
      this.enqueueTelegram(body);
    },

    bettingMessage(legA: BettingMessageLeg, legB: BettingMessageLeg) {
      const matchId = legA.options.match?.id ?? legB.options.match?.id;
      const betId = legA.options.bet?.id ?? legB.options.bet?.id;
      if (matchId != null && betId != null) {
        clearOpportunityPending(matchId, betId);
      }

      const formatLeg = (leg: BettingMessageLeg) => {
        const lines = [
          accountLine(leg.account),
          "<blockquote>",
          `投注队伍：${leg.options.target}`,
          `投注金额：${leg.options.betMoney}@${leg.options.odds}`,
          `投注结果：${leg.result.success ? "✅ 成功" : "❌ 失败"}`,
        ];
        if (leg.result.success) {
          lines.push(`是否拒单：${leg.reject ? "🔴是" : "否"}`);
        }
        lines.push(`备注信息：${leg.result.message ?? "N/A"}</blockquote>`);
        return lines.join("\n");
      };

      const legStatus = [
        orderLegStatusEmoji(legA.result.success, legA.reject),
        orderLegStatusEmoji(legB.result.success, legB.reject),
      ].join("");
      const matchTitle = legA.options.match?.title ?? legB.options.match?.title ?? "";
      const betName =
        legA.options.bet?.getBetName?.() ?? legB.options.bet?.getBetName?.() ?? "";

      this.enqueueTelegram(
        [
          orderHtmlTitle("下单提醒", legStatus),
          `${matchTitle} / ${betName}`,
          "",
          formatLeg(legA),
          formatLeg(legB),
        ].join("\n"),
      );

      const homeLeg = [legA, legB].find((leg) => leg.options.target === "Home");
      const awayLeg = [legA, legB].find((leg) => leg.options.target === "Away");
      if (homeLeg && awayLeg) {
        const implied = 1 / (1 / homeLeg.options.odds + 1 / awayLeg.options.odds);
        const homePlatform = homeLeg.account.platformName || homeLeg.account.provider;
        const awayPlatform = awayLeg.account.platformName || awayLeg.account.provider;
        this.enqueuePush(
          [
            "<b>📣赛事推单</b>",
            `<b>⚽️赛事：${matchTitle}</b>`,
            `<b>1️⃣[${homePlatform}] 主队赔率：${homeLeg.options.odds}</b>`,
            `<b>2️⃣[${awayPlatform}] 客队赔率：${awayLeg.options.odds}</b>`,
            `<b>本单对冲利润：${percent(implied)}（投100块可无风险获利${toFixed(implied * 100 - 100, 2)}元利润）</b>`,
          ].join("\n"),
        );
      }
    },

    /** [changmen 扩展] 比例9999 等单边成功时的简化下单提醒（A8 仅双腿推 📣） */
    singleLegBettingMessage(leg: BettingMessageLeg) {
      const matchId = leg.options.match?.id;
      const betId = leg.options.bet?.id;
      if (matchId != null && betId != null) {
        clearOpportunityPending(matchId, betId);
      }

      const legStatus = orderLegStatusEmoji(leg.result.success, leg.reject);
      const matchTitle = leg.options.match?.title ?? "";
      const betName = leg.options.bet?.getBetName?.() ?? "";
      const lines = [
        accountLine(leg.account),
        "<blockquote>",
        `投注队伍：${leg.options.target}`,
        `投注金额：${leg.options.betMoney}@${leg.options.odds}`,
        `投注结果：${leg.result.success ? "✅ 成功" : "❌ 失败"}`,
      ];
      if (leg.result.success) {
        lines.push(`是否拒单：${leg.reject ? "🔴是" : "否"}`);
      }
      lines.push(`备注信息：${leg.result.message ?? "N/A"}</blockquote>`);

      this.enqueueTelegram(
        [
          orderHtmlTitle("下单提醒", legStatus),
          `${matchTitle} / ${betName}`,
          "",
          lines.join("\n"),
        ].join("\n"),
      );
    },

    loseOrderMessage(
      account: PlatformAccount,
      order: LoseOrder,
      option: BetOption,
      rejected: boolean,
    ) {
      const matchTitle = option.match?.title ?? order.match;
      const betName = option.bet?.getBetName?.() ?? order.bet;
      const body = [
        htmlTitle("补单提醒", rejected),
        accountLine(account),
        `${matchTitle} / ${betName} / ${option.target}`,
        "<blockquote>",
        `原订单时间：${formatDate(order.createAt)}`,
        `原补单金额：${order.getBetMoney(order.betOdds)}@${order.getOdds(useConfigStore().config.makeProfit)}`,
        `补单金额：${option.betMoney}@${option.odds}`,
        `是否拒单：${rejected ? "🔴是" : "否"}`,
        "</blockquote>",
      ].join("\n");
      this.enqueueTelegram(body);
    },

    orderReportMessage(accounts: PlatformAccount[], orders: OrderRow[]) {
      if (!orders.length) return;
      const today = formatDateKey();
      const firstDay = formatDateKey(new Date(Number(orders[0].CreateAt) || Date.now()));
      const reportIdx = NOTIFY_TYPES.indexOf("OrderReport");
      if (firstDay !== today || !this.shouldNotify(reportIdx, "ORDERREPORT", 3600)) return;

      const totalProfit = orders.reduce((sum, r) => sum + (Number(r.Money) || 0), 0);
      const lines = [
        htmlTitle(`${today} 统计报表`),
        `总余额：${Math.round(accounts.reduce((s, a) => s + (a.balance ?? 0), 0)).toLocaleString()} 盈亏：${profitEmoji(totalProfit)}${Math.round(totalProfit).toLocaleString()} 总订单：${orders.length} 未结订单：${accounts.reduce((s, a) => s + (a.unsettle ?? 0), 0)}`,
        "",
      ];
      for (const acc of accounts) {
        lines.push(
          accountLine(acc),
          "<blockquote>",
          `盈亏:${profitEmoji(acc.today ?? 0)}${Math.round(acc.today ?? 0).toLocaleString()}，总盈亏：${toFixed(acc.totalProfit ?? 0, 0)}，`,
          `订单：${acc.orderCount ?? 0}笔，未结：${acc.unsettle ?? 0}笔`,
          "</blockquote>",
        );
      }
      const text = lines.join("\n");
      this.enqueueTelegram(text);
      this.reportQueue.push(text);
    },

    async publishLoseOrderMessage() {
      const user = useUserStore();
      if (!user.setting?.Publisher) return;
      const { useLoseOrderStore } = await import("@/stores/loseOrderStore");
      const loseStore = useLoseOrderStore();
      const lines = [htmlTitle(`[${user.userName}] 补单队列变化`)];
      for (const order of loseStore.orders.values()) {
        lines.push("<blockquote>", order.match, order.bet, `目标：${order.target}`, "</blockquote>");
      }
      if (lines.length <= 1) return;
      this.publishQueue.push(lines.join("\n"));
    },
  },
});
