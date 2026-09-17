/**
 * 跟单行「未下」原因：手点门控 + 自动门控合成一条可展示文案。
 */
import {
  podFollowPlaceBlock,
  type PodFollowPlaceTicket,
} from "@/runtime/podFollowPlace";
import { podYaboAutoSkipReason } from "@/runtime/podYabo/auto";
import type { PodOutcomeGateEntry } from "@/runtime/podYabo/gate";

export type PodFollowPendingTone = "ok" | "ready" | "wait" | "block" | "idle";

export type PodFollowPendingState = {
  placed: boolean;
  /** 主标签：已下 / 未下 / 下单中 */
  label: string;
  /** 原因或注记；已下时可带 order 摘要 */
  detail: string;
  tone: PodFollowPendingTone;
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
  placedIds?: Iterable<string>;
  placedEntries?: Iterable<PodOutcomeGateEntry>;
  cap?: { todayProfit?: number; openStake?: number; maxDailyLoss?: number };
};

export function resolvePodFollowPending(input: PodFollowPendingInput): PodFollowPendingState {
  const note = String(input.placeNote || "").trim();
  if (input.placed)
    return { placed: true, label: "已下", detail: note, tone: "ok" };
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
