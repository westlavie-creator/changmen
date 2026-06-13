import { defineStore } from "pinia";
import { sendMessage } from "@/api/esport";
import { NOTIFY_TYPES } from "@/types/notifyTypes";
import type { BetOption } from "@/models/betOption";
import type { BetResult } from "@/models/betResult";
import type { LoseOrder } from "@/models/loseOrder";
import type { PlatformAccount } from "@/models/platformAccount";
import type { OrderRow } from "@/types/order";
import { useUserStore } from "@/stores/userStore";
import { useConfigStore } from "@/stores/configStore";
import type { ViewBet, ViewMatch } from "@/models/match";
import type { ArbLegs } from "@/domain/arbitrage";
import { arbProfitRate, formatDate, formatDateKey, percent, toFixed } from "@/shared/format";
import { assessValueBet, formatValueBetTelegramLine } from "@/domain/arbitrage";
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

function accountLine(acc: PlatformAccount) {
  return `${acc.platformName || acc.provider} / ${acc.playerName}`;
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

    collectMessage(platform: string, detail: string) {
      const idx = NOTIFY_TYPES.indexOf("Balance");
      if (!this.shouldNotify(idx, platform, 600)) return;
      const body = [
        htmlTitle(`${platform} 本地采集发生错误`),
        `<blockquote>${detail}</blockquote>`,
      ].join("\n");
      this.enqueueTelegram(body);
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
      this.enqueueTelegram([formatLeg(legA), formatLeg(legB)].join("\n"));
    },

    /** [changmen 扩展] 发现满足阈值的套利腿时推送到个人 Telegram（A8 仅在下注成功后推单群） */
    arbOpportunityMessage(match: ViewMatch, bet: ViewBet, legs: ArbLegs) {
      const user = useUserStore();
      if (!user.message?.telegramId?.trim()) return;
      const idx = NOTIFY_TYPES.indexOf("OrderNotify");
      const key = `${match.id}:${bet.id}:${legs.homeItem.type}:${legs.awayItem.type}`;
      if (!this.shouldNotify(idx, key, 600)) return;

      const value = assessValueBet(bet.id, legs);
      const body = [
        htmlTitle("套利机会"),
        match.title,
        bet.getBetName(),
        "<blockquote>",
        `${legs.homeItem.type} 主胜 @ ${legs.homeOdds}`,
        `${legs.awayItem.type} 客胜 @ ${legs.awayOdds}`,
        `对冲 ${percent(legs.implied)} / 利润 ${arbProfitRate(legs.implied)}`,
        formatValueBetTelegramLine(value),
        "</blockquote>",
      ].join("\n");
      this.enqueueTelegram(body);
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
