/**
 * 足球板双击赔率 → 手动输入金额，用 POD 跟单账号走 yewu13 单关。
 * 不进电竞 mainBetLoop / fo。
 */
import { ElMessage, ElMessageBox } from "element-plus";
import { pickObSportBetAccounts } from "@/runtime/obSportBetAccount";
import { placeObSportSingle } from "@/runtime/obSportPlaceBet";
import { readPodBetSettings } from "@/runtime/podBetSettings";
import { useAccountStore } from "@/stores/accountStore";
import { useFootballOrderStore } from "@/stores/footballOrderStore";

export type ObSportBoardPlaceInput = {
  oid: string;
  mid: string;
  odds: number;
  boardSide?: string;
  marketCode?: string;
  line?: number | null;
  home?: string;
  away?: string;
};

let placing = false;

export function sportBoardSideLabel(side: string | undefined): string {
  const s = String(side || "").trim().toLowerCase();
  if (s === "over")
    return "大";
  if (s === "under")
    return "小";
  if (s === "home" || s === "1")
    return "主";
  if (s === "away" || s === "2")
    return "客";
  if (s === "draw" || s === "x")
    return "和";
  return String(side || "").trim();
}

export function sportBoardMarketLabel(marketCode: string | undefined, line: number | null | undefined): string {
  const raw = String(marketCode || "").trim().toLowerCase();
  const ht = raw.startsWith("ht_") || raw.endsWith("_ht");
  const code = raw.replace(/^ht_/, "").replace(/_ht$/, "");
  const prefix = ht ? "半场" : "全场";
  const pts = line == null || !Number.isFinite(Number(line)) ? "" : String(line);
  if (code === "totals")
    return pts ? `${prefix}大小 ${pts}` : `${prefix}大小`;
  if (code === "spreads")
    return pts ? `${prefix}让球 ${pts}` : `${prefix}让球`;
  if (code === "moneyline")
    return `${prefix}独赢`;
  return raw || "盘口";
}

export function formatObSportBoardPlaceTitle(input: ObSportBoardPlaceInput): string {
  const side = sportBoardSideLabel(input.boardSide);
  const market = sportBoardMarketLabel(input.marketCode, input.line);
  const odds = Number(input.odds) > 0 ? Number(input.odds) : 0;
  const teams = [input.home, input.away].filter(Boolean).join(" vs ");
  const head = [teams, market, side].filter(Boolean).join(" · ");
  return odds > 0 ? `${head} @ ${odds}` : head;
}

export async function promptSportBoardStake(input: {
  title: string;
  defaultStake?: number;
  accountCount?: number;
  venue?: string;
}): Promise<number | null> {
  const defaultStake = Number(input.defaultStake) > 0 ? Number(input.defaultStake) : 0;
  const accountHint = Number(input.accountCount) > 1 ? `\n${input.accountCount} 个号各一注` : "";
  try {
    const { value } = await ElMessageBox.prompt(
      `${input.title}${accountHint}\n请输入本次下注金额（RMB）`,
      input.venue ? `${input.venue} 手动下单` : "手动下单",
      {
        type: "warning",
        confirmButtonText: "下单",
        cancelButtonText: "取消",
        inputValue: defaultStake > 0 ? String(Math.round(defaultStake)) : "",
        inputType: "number",
        inputValidator: val => (Number(val) > 0 ? true : "请输入有效金额"),
        customClass: "manual-bet-prompt-box",
      },
    );
    const stake = Number(value);
    return stake > 0 ? stake : null;
  }
  catch {
    return null;
  }
}

export async function placeObSportBoardBet(
  input: ObSportBoardPlaceInput,
): Promise<{ ok: boolean; message: string }> {
  const oid = String(input.oid || "").trim();
  const mid = String(input.mid || "").trim();
  const odds = Number(input.odds) || 0;
  if (!oid)
    return { ok: false, message: "无 oid" };
  if (!mid)
    return { ok: false, message: "无 OB mid" };
  if (!(odds > 0))
    return { ok: false, message: "锁盘或无赔率" };

  const settings = readPodBetSettings();
  const accounts = pickObSportBetAccounts(useAccountStore().accounts, settings.followAccountIds);
  if (!accounts.length)
    return { ok: false, message: "请选择跟单账号（需体育 token）" };

  if (placing)
    return { ok: false, message: "下单中" };

  const title = formatObSportBoardPlaceTitle(input);
  const stake = await promptSportBoardStake({
    title,
    defaultStake: Number(settings.obStake) > 0 ? settings.obStake : settings.stake,
    accountCount: accounts.length,
    venue: "OB",
  });
  if (!(stake && stake > 0))
    return { ok: false, message: "已取消" };

  placing = true;
  const orders = useFootballOrderStore();
  const okNotes: string[] = [];
  const failNotes: string[] = [];
  const side = sportBoardSideLabel(input.boardSide);
  const market = sportBoardMarketLabel(input.marketCode, input.line);
  const at = Date.now();
  try {
    for (const account of accounts) {
      const accountId = Number(account.accountId) || 0;
      const label = String(account.playerName || accountId || "账号").trim() || "账号";
      const placed = await placeObSportSingle({
        oid,
        mid,
        odds,
        stake,
        marketCode: String(input.marketCode || "").trim(),
        boardSide: String(input.boardSide || "").trim(),
        line: input.line,
        accountId,
      });
      if (!placed.ok) {
        failNotes.push(`${label}:${placed.message}`);
        continue;
      }
      const orderId = String(placed.orderId || "").trim();
      await orders.appendPlaced({
        id: `board:${mid}:${oid}:${at}${accountId ? `#${accountId}` : ""}`,
        orderId,
        at,
        home: String(input.home || "").trim(),
        away: String(input.away || "").trim(),
        sideLabel: side,
        marketLabel: market,
        // 优先场馆成交赔率；完整字段由 syncVenueSettlement 从 getOrderListPB 覆盖
        odds: Number(placed.odds) > 1 ? Number(placed.odds) : odds,
        stake,
        oid,
        obMid: mid,
        auto: false,
        status: "None",
        profit: 0,
        playerId: accountId,
        accountName: label,
      }, account);
      okNotes.push(orderId ? `${label}:${orderId}` : label);
    }
  }
  finally {
    placing = false;
  }

  if (!okNotes.length)
    return { ok: false, message: failNotes.join("；") || "下单失败" };
  const head = `已下 ${okNotes.length}/${accounts.length}`;
  const msg = failNotes.length
    ? `${head} ${okNotes.join("、")}；失败 ${failNotes.join("；")}`
    : `${head} ${okNotes.join("、")}`;
  return { ok: true, message: msg.slice(0, 180) };
}

export async function confirmPlaceObSportBoardBet(input: ObSportBoardPlaceInput): Promise<void> {
  const result = await placeObSportBoardBet(input);
  if (result.message === "已取消")
    return;
  if (result.ok)
    ElMessage.success(result.message);
  else
    ElMessage.warning(result.message);
}
