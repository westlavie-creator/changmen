import type {
  AdminOrderLogEntry,
  AdminOrderLogLegSection,
  AdminOrderLogOrder,
} from "@/types/admin";
import { attemptLogSegments } from "@/shared/adminOrderLogSegments";
import { Currency, defaultCurrencyForProvider, getExchange } from "@changmen/shared/currency";

export type AdminOrderDiagnosisTone = "neutral" | "success" | "warning" | "danger";

export interface AdminOrderExecutionStep {
  key: string;
  at: number;
  side: string;
  sideLabel: string;
  provider: string;
  accountLabel: string | null;
  isMakeUp: boolean;
  odds: number | null;
  betMoney: number | null;
  check: AdminOrderLogEntry | null;
  bet: AdminOrderLogEntry | null;
  reject: AdminOrderLogEntry | null;
  order: AdminOrderLogOrder | null;
  outcome: string;
  detail: string | null;
  tone: AdminOrderDiagnosisTone;
  oddsLogic: string;
  stakeLogic: string;
  rejectLogic: string | null;
}

function fmt(n: number, digits = 3) {
  return Number(n.toFixed(digits)).toString();
}

function planStakeCny(step: Pick<AdminOrderExecutionStep, "provider" | "betMoney" | "check">) {
  const loggedPlan = Number(step.check?.planBetMoney);
  if (loggedPlan > 0)
    return loggedPlan;
  const amount = Number(step.betMoney) || 0;
  return defaultCurrencyForProvider(step.provider) === Currency.USDT
    ? amount * getExchange(Currency.USDT)
    : amount;
}

function stakeConversionText(step: AdminOrderExecutionStep) {
  const actual = venueStakeText(step.provider, step.betMoney);
  const plan = Number(step.check?.planBetMoney);
  if (!(plan > 0)) {
    return defaultCurrencyForProvider(step.provider) === Currency.USDT
      ? `按历史默认汇率 1U=¥${getExchange(Currency.USDT)}，提交 ${actual}`
      : `取整后提交 ${actual}`;
  }
  const exchange = Number(step.check?.stakeExchange) || 1;
  const rate = Number(step.check?.stakeRate) || 1;
  const details = [
    exchange !== 1 ? `汇率 ${fmt(exchange, 3)}` : "",
    Math.abs(rate - 1) > 0.001 ? `账号比例 ${fmt(rate, 3)}` : "",
  ].filter(Boolean).join("、");
  return `计划金额 ¥${fmt(plan, 2)}${details ? `，经${details}` : ""}，场馆提交 ${actual}`;
}

function venueStakeText(provider: string, amount: number | null) {
  const n = Number(amount) || 0;
  const currency = defaultCurrencyForProvider(provider);
  if (currency === Currency.USDT) {
    const unit = provider === "Polymarket" ? "USDC" : "USDT";
    return `${fmt(n, 2)} ${unit}（约 ¥${fmt(n * getExchange(currency), 0)}）`;
  }
  return `¥${fmt(n, 0)}`;
}

function elapsedText(ms: number) {
  if (ms < 1_000)
    return `${Math.max(0, Math.round(ms))}ms`;
  return `${fmt(ms / 1_000, 1)}秒`;
}

function statusText(status: string | null | undefined) {
  const s = String(status || "").toLowerCase();
  if (s === "win")
    return "已结算：赢";
  if (s === "lose")
    return "已结算：输";
  if (s === "reject")
    return "场馆拒单";
  if (s === "return")
    return "已退回";
  if (s === "pending" || s === "none")
    return "场馆待确认";
  return status ? `场馆状态：${status}` : "";
}

function outcomeFor(
  check: AdminOrderLogEntry | null,
  bet: AdminOrderLogEntry | null,
  reject: AdminOrderLogEntry | null,
  order: AdminOrderLogOrder | null,
): Pick<AdminOrderExecutionStep, "outcome" | "detail" | "tone"> {
  if (bet?.success === false) {
    return {
      outcome: "下单失败",
      detail: bet.message || check?.checkError || null,
      tone: "danger",
    };
  }

  if (reject?.settlement === "unfilled") {
    return {
      outcome: bet?.success === true ? "接口受理 → 场馆拒单" : "场馆拒单",
      detail: reject.rejectReason || null,
      tone: "danger",
    };
  }

  const finalStatus = statusText(order?.status);
  if (String(order?.status || "").toLowerCase() === "reject") {
    return {
      outcome: bet?.success === true ? "接口受理 → 场馆拒单" : "场馆拒单",
      detail: bet?.message || null,
      tone: "danger",
    };
  }
  if (order) {
    const lower = String(order.status || "").toLowerCase();
    return {
      outcome: bet?.success === true ? `接口受理 → ${finalStatus}` : finalStatus,
      detail: bet?.message || null,
      tone: lower === "win" ? "success" : lower === "lose" ? "danger" : "warning",
    };
  }
  if (bet?.success === true) {
    return {
      outcome: "接口受理 · 未找到场馆订单",
      detail: bet.message || null,
      tone: "warning",
    };
  }
  if (check?.checkError) {
    return { outcome: "预检失败", detail: check.checkError, tone: "danger" };
  }
  return { outcome: "仅有预检，未见下单结果", detail: null, tone: "warning" };
}

function segmentMatchesOrder(
  provider: string | null | undefined,
  logs: AdminOrderLogEntry[],
  at: number,
  order: AdminOrderLogOrder | null,
) {
  if (!order || (provider && order.provider && provider !== order.provider))
    return false;
  if (logs.some(log => String(log.orderId || "") === String(order.orderId)))
    return true;
  // inferred matchedOrderId 可能把同平台早先失败尝试挂到后来的补单；时间过远时不共享终态。
  return Math.abs(Number(at) - Number(order.createAt)) <= 15_000;
}

/** 把主客队分栏还原成按时间排序的真实执行链。 */
export function buildAdminOrderExecutionSteps(
  legs: AdminOrderLogLegSection[],
): AdminOrderExecutionStep[] {
  const steps: AdminOrderExecutionStep[] = [];

  for (const leg of legs) {
    for (const attempt of leg.attempts) {
      const segments = attemptLogSegments(attempt);
      if (!segments.length && attempt.order) {
        const result = outcomeFor(null, null, null, attempt.order);
        steps.push({
          key: `order:${attempt.order.orderId}`,
          at: attempt.order.createAt,
          side: leg.side,
          sideLabel: leg.label,
          provider: attempt.order.provider,
          accountLabel: null,
          isMakeUp: false,
          odds: attempt.order.odds || null,
          betMoney: attempt.order.betMoney || null,
          check: null,
          bet: null,
          reject: null,
          order: attempt.order,
          oddsLogic: "订单缺少对应预检日志，无法还原当时赔率来源",
          stakeLogic: "订单缺少对应预检日志，无法还原金额公式",
          rejectLogic: String(attempt.order.status || "").toLowerCase() === "reject"
            ? "场馆最终状态为拒单；旧日志未记录发现时间与拒因"
            : null,
          ...result,
        });
        continue;
      }

      for (const segment of segments) {
        const check = segment.logs.find(log => log.kind === "check") ?? null;
        const bet = [...segment.logs].reverse().find(log => log.kind === "bet") ?? null;
        const reject = [...segment.logs].reverse().find(log => log.kind === "reject") ?? null;
        const provider = String(segment.provider || check?.provider || bet?.provider || attempt.order?.provider || "未知");
        const at = Number(check?.createAt || bet?.createAt || attempt.order?.createAt) || 0;
        const order = segmentMatchesOrder(provider, segment.logs, at, attempt.order) ? attempt.order : null;
        const result = outcomeFor(check, bet, reject, order);
        steps.push({
          key: `${attempt.key}:${segment.key}`,
          at,
          side: leg.side,
          sideLabel: leg.label,
          provider,
          accountLabel: segment.accountLabel || check?.accountLabel || bet?.accountLabel || null,
          isMakeUp: Boolean(segment.isMakeUp || check?.loseOrder),
          odds: Number(check?.newOdds ?? check?.odds ?? order?.odds) || null,
          betMoney: Number(check?.betMoney ?? order?.betMoney) || null,
          check,
          bet,
          reject,
          order,
          oddsLogic: segment.isMakeUp || check?.loseOrder
            ? `补单赔率 ${Number(check?.newOdds ?? check?.odds ?? order?.odds) || "—"} 来自补单执行时的场馆实时盘口，不是由公式计算`
            : `下单赔率 ${Number(check?.newOdds ?? check?.odds ?? order?.odds) || "—"} 来自本轮预检实时盘口`,
          stakeLogic: "等待同组订单计算",
          rejectLogic: null,
          ...result,
        });
      }
    }
  }

  steps.sort((a, b) => a.at - b.at || a.key.localeCompare(b.key));

  const originals = steps.filter(step => !step.isMakeUp && step.odds && step.betMoney);
  const initialBySide = new Map<string, AdminOrderExecutionStep>();
  for (const step of originals) {
    if (!initialBySide.has(step.side))
      initialBySide.set(step.side, step);
  }
  const initialPair = [...initialBySide.values()];
  const base = [...initialPair].sort((a, b) => Number(a.odds) - Number(b.odds))[0];
  if (base?.odds && base.betMoney) {
    const baseCny = planStakeCny(base);
    for (const step of initialPair) {
      if (!step.odds || !step.betMoney)
        continue;
      if (step === base) {
        step.stakeLogic = `低赔腿作为基准注码：${stakeConversionText(step)}`;
        continue;
      }
      const calculatedCny = (baseCny * Number(base.odds)) / Number(step.odds);
      step.stakeLogic = `对冲金额 = ¥${fmt(baseCny, 0)} × ${base.odds} ÷ ${step.odds} = ¥${fmt(calculatedCny, 2)}；${stakeConversionText(step)}`;
    }
  }

  for (const step of steps.filter(row => row.isMakeUp)) {
    const anchor = [...steps]
      .filter(row => !row.isMakeUp
        && row.at < step.at
        && row.side !== step.side
        && row.bet?.success === true
        && row.odds
        && row.betMoney)
      .sort((a, b) => b.at - a.at)[0];
    if (anchor?.odds && anchor.betMoney && step.odds && step.betMoney) {
      const anchorCny = planStakeCny(anchor);
      const calculatedCny = (anchorCny * Number(anchor.odds)) / Number(step.odds);
      step.stakeLogic = `补单金额 = 锚腿 ¥${fmt(anchorCny, 0)} × ${anchor.odds} ÷ 实时赔率 ${step.odds} = ¥${fmt(calculatedCny, 2)}；${stakeConversionText(step)}`;
    }
    else {
      step.stakeLogic = `补单提交 ${venueStakeText(step.provider, step.betMoney)}；缺少锚腿日志，无法完整还原公式`;
    }
  }

  for (const step of steps) {
    if (step.bet?.success === false) {
      const delay = step.check && step.bet
        ? Math.max(0, step.bet.createAt - step.check.createAt)
        : null;
      step.rejectLogic = `即时失败：接口未受理${delay == null ? "" : `，预检到失败间隔 ${elapsedText(delay)}`}；原因：${step.bet.message || step.check?.checkError || "场馆未返回原因"}`;
      continue;
    }
    if (
      String(step.order?.status || "").toLowerCase() !== "reject"
      && step.reject?.settlement !== "unfilled"
    )
      continue;
    const rejectLog = step.reject;
    const delayMs = Number(rejectLog?.rejectDelayMs);
    const reason = rejectLog?.rejectReason || "场馆最终状态为 Reject，但未返回具体拒因";
    step.rejectLogic = step.bet?.success === true
      ? `事后拒单：下单接口先受理，随后场馆订单变为拒单${delayMs > 0 ? `，间隔 ${elapsedText(delayMs)}` : "；旧日志未记录准确发现时间，无法计算间隔"}；原因：${reason}`
      : `场馆拒单；原因：${reason}`;
  }

  return steps;
}

export function buildAdminOrderDiagnosisSummary(
  steps: AdminOrderExecutionStep[],
  totalProfit: number,
): { text: string; tone: AdminOrderDiagnosisTone } {
  const originals = steps.filter(step => !step.isMakeUp);
  const apiFailures = originals.filter(step => step.bet?.success === false).length;
  const venueRejects = originals.filter(step =>
    String(step.order?.status || "").toLowerCase() === "reject"
    || step.reject?.settlement === "unfilled",
  ).length;
  const makeups = steps.filter(step => step.isMakeUp).length;
  const parts: string[] = [];

  if (apiFailures || venueRejects) {
    const failures = [
      apiFailures ? `${apiFailures} 腿下单失败` : "",
      venueRejects ? `${venueRejects} 笔场馆拒单` : "",
    ].filter(Boolean).join("，");
    parts.push(`原始套利未成立：${failures}`);
  }
  else {
    parts.push("原始套利两腿未发现失败或拒单");
  }
  if (makeups)
    parts.push(`随后执行 ${makeups} 次补单`);
  const sign = totalProfit > 0 ? "+" : "";
  parts.push(`最终 Link 盈亏 ¥${sign}${Math.floor(totalProfit).toLocaleString()}`);

  return {
    text: parts.join("；"),
    tone: totalProfit < 0 || apiFailures > 0 || venueRejects > 0
      ? "danger"
      : totalProfit > 0
        ? "success"
        : "neutral",
  };
}
