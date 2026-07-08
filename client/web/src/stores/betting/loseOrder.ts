import { BetOption, opponentSide } from "@/models/betOption";
import { a8Tip } from "@/shared/a8Notify";
import { makeUpBetToastSeconds } from "@/shared/betTiming";
import { PLATFORMS } from "@/shared/platform";
import { wait } from "@/shared/wait";
import { useAccountStore } from "@/stores/accountStore";
import { passesMakeUpAccount } from "@/stores/betting/betFilters";
import {
  buildLoseOrderBetLookup,
  resolveLoseOrderBetRef,
} from "@/stores/betting/loseOrderLookup";
import {
  applyPmJbSettlementOutcome,
  tryResumePmPendingMakeUp,
} from "@/stores/betting/loseOrderPmPending";
import { processA8RegularVenueMakeUpLeg } from "@/stores/betting/loseOrderRegular";
import { markSuccessfulBet, readUsedAccounts } from "@/stores/betting/successMarkers";
import {
  syncActiveBetMakeupAttempt,
  syncActiveBetMakeupSettling,
} from "@/stores/betting/activeBetRunSync";
import { useUserStore } from "@/stores/userStore";
import { useLoseOrderStore } from "@/stores/loseOrderStore";
import { useMatchStore } from "@/stores/matchStore";

export interface LoseOrderTickContext {
  setMessage: (msg: string) => void;
}

/**
 * [A8 可证实] 补单队列消费（bundle `jb`）
 *
 * 普通场馆：见 `loseOrderRegular.ts`（严格对齐 index0706）。
 * [changmen 扩展] PM：`pendingPmOrderId` / delayed settle，待独立演进。
 */
export async function processLoseOrders(ctx: LoseOrderTickContext): Promise<void> {
  const user = useUserStore();
  const matchStore = useMatchStore();
  const accountStore = useAccountStore();
  const loseStore = useLoseOrderStore();
  const config = user.config;
  const { setMessage } = ctx;
  const removeIds = new Set<number>();
  const betLookup = buildLoseOrderBetLookup(matchStore.matchs);

  for (const [betId, order] of loseStore.orders) {
    const ref = resolveLoseOrderBetRef(order, matchStore.matchs, betLookup);
    if (!ref) {
      // [A8 可证实] `!ce||!ge` → Z.push(z) 出队
      // [changmen 扩展] link 绑定补单：刷新后列表未就绪时暂保留展示
      if (order.isLinkBoundMakeup())
        continue;
      removeIds.add(betId);
      continue;
    }
    const { match, bet } = ref;

    const resumed = await tryResumePmPendingMakeUp({
      betId,
      order,
      match,
      bet,
      accountStore,
      loseStore,
      removeIds,
      setMessage,
      markSuccess: account => markSuccessfulBet(account, bet.id, order.target),
    });
    if (resumed === "handled")
      continue;

    const minOdds = order.getOdds(config.makeProfit);
    const candidates = bet.items
      .filter(item => item.getOdds(order.target) >= minOdds)
      .sort((a, b) => b.getOdds(order.target) - a.getOdds(order.target));

    for (const item of candidates) {
      if (removeIds.has(betId))
        break;

      if (order.pendingPmOrderId && item.type === PLATFORMS.Polymarket)
        break;

      const sideOdds = item.getOdds(order.target);
      const stake = order.getBetMoney(sideOdds);
      const account = accountStore.getAccount(
        item.type,
        stake,
        config.noSameProvider ? readUsedAccounts(bet.id, opponentSide(order.target)) : [],
        acc => passesMakeUpAccount(acc, sideOdds, bet.id, order.target),
      );
      if (!account)
        continue;

      const option = new BetOption(match, bet, item, order.target, stake);
      option.loseOrder = true;

      const checked = await accountStore.checkBetting(account, option);
      if (!checked.data)
        continue;

      const waitSec = makeUpBetToastSeconds(config, account.provider);
      syncActiveBetMakeupAttempt(betId, item.type, `尝试补单 @${sideOdds}`);
      const result = await accountStore.betting(account, checked, waitSec);

      if (!result?.success) {
        // [A8 可证实] `else le||Z.push(z)`：null/undefined 出队；`{success:false}` 保留
        if (!result)
          removeIds.add(betId);
        continue;
      }

      if (account.provider === PLATFORMS.Polymarket) {
        // [changmen 扩展] A8 jb 无 PM 腿；单独路径，每 tick 最多 POST 一次
        if (waitSec > 0) {
          a8Tip("拒单检测", `等待<countdown>${waitSec}</countdown>秒`, waitSec * 1000);
          syncActiveBetMakeupSettling(betId, waitSec);
          await wait(waitSec * 1000);
        }
        await applyPmJbSettlementOutcome({
          betId,
          order,
          match,
          bet,
          account,
          result,
          checked,
          platformLabel: item.type,
          loseStore,
          removeIds,
          setMessage,
        });
        markSuccessfulBet(account, bet.id, order.target);
        break;
      }

      await processA8RegularVenueMakeUpLeg({
        betId,
        order,
        bet,
        account,
        checked,
        result,
        waitSec,
        accountStore,
        removeIds,
        setMessage,
      });
      // [A8 可证实] 拒单不出队时内层 for 继续下一 platform；出队后下轮 removeIds.has 打断
    }
  }

  for (const betId of removeIds) {
    if (loseStore.orders.has(betId))
      loseStore.removeOrder(betId, true);
  }
}
