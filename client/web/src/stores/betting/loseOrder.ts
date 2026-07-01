import { saveOrderBind } from "@/api/esport";
import { isVenueReject } from "@/domain/betting";
import { BetOption, opponentSide } from "@/models/betOption";
import { a8Tip } from "@/shared/a8Notify";
import { makeUpBetToastSeconds } from "@/shared/betTiming";
import { wait } from "@/shared/wait";
import { useAccountStore } from "@/stores/accountStore";
import { passesMakeUpAccount } from "@/stores/betting/betFilters";
import { buildLoseOrderBetLookup } from "@/stores/betting/loseOrderLookup";
import { markSuccessfulBet, readUsedAccounts } from "@/stores/betting/successMarkers";
import { useConfigStore } from "@/stores/configStore";
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
 */
export async function processLoseOrders(ctx: LoseOrderTickContext): Promise<void> {
  const configStore = useConfigStore();
  const matchStore = useMatchStore();
  const accountStore = useAccountStore();
  const loseStore = useLoseOrderStore();
  const config = configStore.config;
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

    bet.items.forEach(item => item.updateOdds());
    const minOdds = order.getOdds(config.makeProfit);
    const candidates = bet.items
      .filter(item => item.getOdds(order.target) >= minOdds)
      .sort((a, b) => b.getOdds(order.target) - a.getOdds(order.target));

    for (const item of candidates) {
      if (removeIds.has(betId))
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

      if (waitSec > 0) {
        a8Tip("拒单检测", `等待<countdown>${waitSec}</countdown>秒`, waitSec * 1000);
        await wait(waitSec * 1000);

        const venueOrders = (await account.updateOrders()) ?? [];
        let rejected = false;
        if (venueOrders.length > 0) {
          rejected = isVenueReject(venueOrders);
          if (rejected) {
            setMessage(`${order.target} 再次被拒单`);
            a8Tip("拒单提醒", `${order.target} 再次被拒单`, 3000);
          }
          else {
            removeIds.add(betId);
            setMessage(`补单成功 ${item.type}@${checked.odds}`);
          }
          await saveOrderBind({
            orders: JSON.stringify([
              {
                LinkID: order.linkId,
                Provider: result.provider,
                OrderID: venueOrders[0]!.orderId,
              },
            ]),
          });
        }
        else {
          removeIds.add(betId);
        }
        useMessageStore().loseOrderMessage(account, order, checked, rejected);
      }
      else {
        removeIds.add(betId);
      }

      markSuccessfulBet(account, bet.id, order.target);
    }
  }

  for (const betId of removeIds) {
    if (loseStore.orders.has(betId))
      loseStore.removeOrder(betId, true);
  }
}
