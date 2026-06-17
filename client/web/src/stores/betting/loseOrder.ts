import { saveOrderBind } from "@/api/esport";
import { BetOption, opponentSide } from "@/models/betOption";
import { useAccountStore } from "@/stores/accountStore";
import { useConfigStore } from "@/stores/configStore";
import { useLoseOrderStore } from "@/stores/loseOrderStore";
import { useMatchStore } from "@/stores/matchStore";
import { useMessageStore } from "@/stores/messageStore";
import { passesDefaultOddsAccount } from "@/stores/betting/betFilters";
import { fetchVenueOrdersWithReject } from "@/stores/betting/autoBet/venueRejectSync";
import { markSuccessfulBet, readUsedAccounts } from "@/stores/betting/successMarkers";
import { wait } from "@/shared/wait";
import { a8Tip } from "@/shared/a8Notify";
import { makeUpBetToastSeconds } from "@/shared/betTiming";

export interface LoseOrderTickContext {
  setMessage: (msg: string) => void;
}

/** [A8 可证实] 补单队列处理（jb 后半） */
export async function processLoseOrders(ctx: LoseOrderTickContext): Promise<void> {
  const configStore = useConfigStore();
  const matchStore = useMatchStore();
  const accountStore = useAccountStore();
  const loseStore = useLoseOrderStore();
  const config = configStore.config;
  const { setMessage } = ctx;
  const removeIds: number[] = [];

  for (const [betId, order] of loseStore.orders) {
    const match = matchStore.matchs.find((m) => m.id === order.matchId);
    if (!match) {
      removeIds.push(betId);
      continue;
    }
    const bet = match.bets.find((b) => b.id === order.betId);
    if (!bet) {
      removeIds.push(betId);
      continue;
    }

    bet.items.forEach((item) => item.updateOdds());
    const minOdds = order.getOdds(config.makeProfit);
    const candidates = bet.items
      .filter((item) => item.getOdds(order.target) >= minOdds)
      .sort((a, b) => b.getOdds(order.target) - a.getOdds(order.target));

    for (const item of candidates) {
      if (removeIds.includes(betId)) break;
      const stake = order.getBetMoney(item.getOdds(order.target));
      const account = accountStore.getAccount(
        item.type,
        stake,
        config.noSameProvider ? readUsedAccounts(bet.id, opponentSide(order.target)) : [],
        (acc) => {
          if (acc.isPause() || acc.noMarkup) return false;
          const odds = item.getOdds(order.target);
          if (acc.minOdds !== 0 && odds < acc.minOdds) return false;
          if (acc.maxOdds !== 0 && odds > acc.maxOdds) return false;
          if (!passesDefaultOddsAccount(acc, bet.id, order.target)) return false;
          return true;
        },
      );
      if (!account) continue;

      const option = new BetOption(
        item.type,
        item.matchId,
        item.betId,
        item.getItemId(order.target),
        stake,
        order.target,
        item.getOdds(order.target),
      );
      option.loseOrder = true;
      option.match = match;
      option.bet = bet;
      option.item = item;

      const checked = await accountStore.checkBetting(account, option);
      if (!checked.data) continue;

      const waitSec = makeUpBetToastSeconds(config, account.provider);
      const result = await accountStore.betting(account, checked, waitSec);
      if (!result?.success) {
        if (!result) removeIds.push(betId);
        continue;
      }

      if (order.isCreateOrder) {
        removeIds.push(betId);
        markSuccessfulBet(account, bet.id, order.target, checked.odds, match.game);
        setMessage(`补单成功 ${item.type}@${checked.odds}`);
        useMessageStore().loseOrderMessage(account, order, checked, false);
        continue;
      }

      // 对齐 A8 补单：waitSec>0 才拒单复检；被拒不移出队列、仍绑单；API 成功即 markSuccessfulBet
      if (waitSec > 0) {
        a8Tip("拒单检测", `等待<countdown>${waitSec}</countdown>秒`, waitSec * 1000);
        await wait(waitSec * 1000);

        const { orders: venueOrders, rejected } = await fetchVenueOrdersWithReject(account);
        if (venueOrders.length > 0) {
          if (rejected) {
            setMessage(`${order.target} 再次被拒单`);
            a8Tip("拒单提醒", `${order.target} 再次被拒单`, 3000);
          } else {
            removeIds.push(betId);
            setMessage(`补单成功 ${item.type}@${checked.odds}`);
          }
          await saveOrderBind({
            orders: JSON.stringify([
              {
                LinkID: order.linkId,
                Provider: result.provider,
                OrderID: venueOrders[0].orderId,
              },
            ]),
          });
        } else {
          removeIds.push(betId);
        }
        useMessageStore().loseOrderMessage(account, order, checked, rejected);
      } else {
        removeIds.push(betId);
      }

      markSuccessfulBet(account, bet.id, order.target, checked.odds, match.game);
    }
  }

  for (const id of removeIds) {
    loseStore.removeOrder(id, true);
  }
}
