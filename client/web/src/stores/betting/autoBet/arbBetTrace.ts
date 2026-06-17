import { BetOption } from "@/models/betOption";
import type { PlatformAccount } from "@/models/platformAccount";
import { BetResult } from "@/models/betResult";
import type { ArbFlowTrace } from "@/extensions/arbBet/betTrace";

function formatCheckFailDetail(leg: BetOption): string {
  const err = leg.checkError?.trim();
  if (err) return err;
  const res = leg.response as { status?: string; data?: string } | undefined;
  const data = String(res?.data ?? "").trim();
  if (data) return data;
  if (res?.status && res.status !== "true") return `status=${res.status}`;
  return "失败";
}

export function traceCheckLegs(
  trace: ArbFlowTrace,
  legA: BetOption,
  legB: BetOption,
  accountA: PlatformAccount | undefined,
  accountB: PlatformAccount | undefined,
) {
  if (accountA) {
    trace.event(
      "预检",
      `${legA.type} ${legA.data ? "✅" : `❌ ${formatCheckFailDetail(legA)}`}`,
    );
  }
  if (accountB) {
    trace.event(
      "预检",
      `${legB.type} ${legB.data ? "✅" : `❌ ${formatCheckFailDetail(legB)}`}`,
    );
  }
}

export function traceBetLeg(
  trace: ArbFlowTrace,
  leg: BetOption,
  account: PlatformAccount | undefined,
  result: BetResult | undefined,
) {
  if (!account) return;
  trace.event(
    "下单",
    `${leg.type}/${account.playerName} ${result?.success ? "✅" : `❌ ${result?.message ?? "失败"}`}`,
  );
}
