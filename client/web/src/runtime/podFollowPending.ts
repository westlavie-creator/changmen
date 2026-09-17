/**
 * 跟单行「未下」原因 / 「已下」回执。
 */
import { formatPodAgo } from "@/runtime/podAlerts";
import {
  podFollowPlaceBlock,
  type PodFollowPlaceTicket,
} from "@/runtime/podFollowPlace";
import { podYaboAutoSkipReason } from "@/runtime/podYabo/auto";
import type { PodOutcomeGateEntry } from "@/runtime/podYabo/gate";

export type PodFollowPendingTone = "ok" | "ready" | "wait" | "block" | "idle";

export type PodFollowPlacedReceipt = {
  clock: string;
  ago: string;
  match: string;
  pick: string;
  accounts: string;
};

export type PodFollowPendingState = {
  placed: boolean;
  /** 主标签：已下 / 未下 / 下单中 */
  label: string;
  /** 单行摘要（tooltip / 紧凑）；已下时优先看 receipt */
  detail: string;
  tone: PodFollowPendingTone;
  receipt?: PodFollowPlacedReceipt;
};

export type PodFollowPendingInput = {
  ticket: PodFollowPlaceTicket | null;
  placed: boolean;
  placing?: boolean;
  autoPlace: boolean;
  withinAge: boolean;
  maxAgeSec: number;
  autoAttempted?: boolean;
  placeNote?: string;
  placedAt?: number;
  home?: string;
  away?: string;
  sideLabel?: string;
  marketLabel?: string;
  now?: number;
  placedIds?: Iterable<string>;
  placedEntries?: Iterable<PodOutcomeGateEntry>;
  cap?: { todayProfit?: number; openStake?: number; maxDailyLoss?: number };
};

/** 去掉历史「已下 1/1 」前缀，只留账号:订单号 */
export function normalizePodFollowPlaceAccounts(note: string): string {
  let s = String(note || "").trim();
  if (!s)
    return "";
  s = s.replace(/^已下\s+\d+\/\d+\s+/, "");
  s = s.replace(/^已下\s+/, "");
  return s.trim();
}

export function formatPodFollowPlaceClock(at: number): string {
  const n = Number(at) || 0;
  if (!(n > 0))
    return "";
  const d = new Date(n);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function buildPodFollowPlacedReceipt(input: {
  placedAt?: number;
  home?: string;
  away?: string;
  sideLabel?: string;
  marketLabel?: string;
  placeNote?: string;
  now?: number;
}): PodFollowPlacedReceipt {
  const now = Number(input.now) || Date.now();
  const placedAt = Number(input.placedAt) || 0;
  const home = String(input.home || "").trim();
  const away = String(input.away || "").trim();
  const side = String(input.sideLabel || "").trim();
  const market = String(input.marketLabel || "").trim();
  const match = home && away ? `${home} vs ${away}` : home || away;
  const pickParts = [
    side ? (side.startsWith("买") ? side : `买${side}`) : "",
    market,
  ].filter(Boolean);
  return {
    clock: formatPodFollowPlaceClock(placedAt),
    ago: placedAt > 0 ? formatPodAgo(placedAt, now) : "",
    match,
    pick: pickParts.join(" · "),
    accounts: normalizePodFollowPlaceAccounts(String(input.placeNote || "")),
  };
}

function formatReceiptDetail(receipt: PodFollowPlacedReceipt): string {
  return [
    receipt.clock || receipt.ago,
    receipt.pick,
    receipt.match,
    receipt.accounts,
  ].filter(Boolean).join(" · ");
}

export function resolvePodFollowPending(input: PodFollowPendingInput): PodFollowPendingState {
  const note = String(input.placeNote || "").trim();
  if (input.placed) {
    const receipt = buildPodFollowPlacedReceipt({
      placedAt: input.placedAt,
      home: input.home,
      away: input.away,
      sideLabel: input.sideLabel,
      marketLabel: input.marketLabel,
      placeNote: note,
      now: input.now,
    });
    return {
      placed: true,
      label: "已下",
      detail: formatReceiptDetail(receipt),
      tone: "ok",
      receipt,
    };
  }
  if (input.placing)
    return { placed: false, label: "下单中", detail: "", tone: "wait" };
  if (note)
    return { placed: false, label: "未下", detail: note, tone: "block" };

  const ticket = input.ticket;
  if (!ticket) {
    return {
      placed: false,
      label: "未下",
      detail: "已离线",
      tone: "idle",
    };
  }

  const handBlock = podFollowPlaceBlock(ticket);
  if (handBlock)
    return { placed: false, label: "未下", detail: handBlock, tone: "block" };

  if (!input.autoPlace) {
    return { placed: false, label: "未下", detail: "可手点", tone: "ready" };
  }

  if (input.autoAttempted)
    return { placed: false, label: "未下", detail: "自动已试过", tone: "idle" };

  if (!input.withinAge) {
    const sec = Number(input.maxAgeSec) || 0;
    return {
      placed: false,
      label: "未下",
      detail: sec > 0 ? `降赔已过期(${sec}s)` : "降赔已过期",
      tone: "idle",
    };
  }

  const auto = podYaboAutoSkipReason(
    ticket,
    input.placedIds || [],
    input.placedEntries || [],
    input.cap || {},
  );
  if (auto) {
    const wait = auto === "等实时价" || auto === "身份未确认";
    return {
      placed: false,
      label: "未下",
      detail: auto,
      tone: wait ? "wait" : "block",
    };
  }

  return { placed: false, label: "未下", detail: "待自动", tone: "ready" };
}

export function formatPodFollowPending(state: PodFollowPendingState): string {
  if (!state.detail)
    return state.label;
  return `${state.label} · ${state.detail}`;
}
