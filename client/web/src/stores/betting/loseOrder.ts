import { saveOrderBind } from "@/api/esport";
import { resolveA8VenueBindOrderId, resolveA8VenueReject } from "@/domain/betting";
import { BetOption, opponentSide } from "@/models/betOption";
import { a8Tip } from "@/shared/a8Notify";
import { makeUpBetToastSeconds } from "@/shared/betTiming";
import { PLATFORMS } from "@/shared/platform";
import { wait } from "@/shared/wait";
import { sortVenueOrdersNewestFirst } from "@venue/contract";
import { useAccountStore } from "@/stores/accountStore";
import { passesMakeUpAccount } from "@/stores/betting/betFilters";
import { buildLoseOrderBetLookup } from "@/stores/betting/loseOrderLookup";
import {
  applyPmJbSettlementOutcome,
  tryResumePmPendingMakeUp,
} from "@/stores/betting/loseOrderPmPending";
import { markSuccessfulBet, readUsedAccounts } from "@/stores/betting/successMarkers";
import {
  syncActiveBetMakeupAttempt,
  syncActiveBetMakeupDone,
  syncActiveBetMakeupRejected,
  syncActiveBetMakeupSettling,
} from "@/stores/betting/activeBetRunSync";
import { useUserStore } from "@/stores/userStore";
import { useLoseOrderStore } from "@/stores/loseOrderStore";
import { useMatchStore } from "@/stores/matchStore";
import { useMessageStore } from "@/stores/messageStore";

export interface LoseOrderTickContext {
  setMessage: (msg: string) => void;
}

/**
 * [A8 可证实] 补单队列消费（bundle `jb` 后半）
 *
 * 多 OB 子账号：每轮主循环对每个 item 只调一次 getAccount（round-robin），
 * 失败则试下一 platform item；同平台下一子账号靠下一轮 ~100ms 主循环。
 *
 * [changmen 扩展] PM：`pendingPmOrderId` 时续轮 settle，timeout 不重复 POST。
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
    const ref = betLookup.get(order.betId);
    if (!ref) {
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
        if (!result)
          removeIds.add(betId);
        continue;
      }

      // [A8 可证实] isCreateOrder：出队 + markSuccessfulBet；无拒单复检、无 LoseOrderMessage
      if (order.isCreateOrder) {
        removeIds.add(betId);
        markSuccessfulBet(account, bet.id, order.target);
        continue;
      }

      if (account.provider === PLATFORMS.Polymarket) {
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
      }
      else {
        // [A8 可证实] jb：isCreateOrder 已在上方出队；be>0 先 wait，be!==0 再 updateOrders + orders[0] 判拒
        if (waitSec > 0) {
          a8Tip("拒单检测", `等待<countdown>${waitSec}</countdown>秒`, waitSec * 1000);
          syncActiveBetMakeupSettling(betId, waitSec);
          await wait(waitSec * 1000);
        }

        let rejected = false;
        if (waitSec !== 0) {
          const rawOrders = (await accountStore.updateVenueOrders(account)) ?? [];
          const venueOrders = sortVenueOrdersNewestFirst(rawOrders);
          rejected = resolveA8VenueReject(venueOrders);

          if (venueOrders.length > 0) {
            if (rejected) {
              setMessage(`${order.target} 再次被拒单`);
              a8Tip("拒单提醒", `${order.target} 再次被拒单`, 3000);
              syncActiveBetMakeupRejected(betId, order.target);
            }
            else {
              removeIds.add(betId);
              syncActiveBetMakeupDone(betId, item.type, checked.odds);
            }
            const bindOrderId = resolveA8VenueBindOrderId(venueOrders);
            if (bindOrderId) {
              await saveOrderBind({
                orders: JSON.stringify([
                  {
                    LinkID: order.linkId,
                    Provider: result.provider,
                    OrderID: bindOrderId,
                  },
                ]),
              });
            }
          }
          else {
            removeIds.add(betId);
            syncActiveBetMakeupDone(betId, item.type, checked.odds);
          }
          useMessageStore().loseOrderMessage(account, order, checked, rejected);
        }
        else {
          removeIds.add(betId);
        }
      }

      markSuccessfulBet(account, bet.id, order.target);
    }
  }

  for (const betId of removeIds) {
    if (loseStore.orders.has(betId))
      loseStore.removeOrder(betId, true);
  }
}
