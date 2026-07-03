<script setup lang="ts">
import type { OrderRow } from "@/types/order";
import { USDT_CNY_EXCHANGE } from "@changmen/shared/account_multiply";
import { formatDisplayOdds, formatOrderTime, toFixed } from "@/shared/format";
import {
  isArbGroup,
  orderLegendModifier,
  orderLegendText,
} from "@/shared/orderDisplay";

export type OrderListEntry = readonly [number, OrderRow[]];

function isPmRow(row: OrderRow): boolean {
  return String(row.Type ?? "") === "Polymarket";
}

function isPmSellRow(row: OrderRow): boolean {
  return isPmRow(row) && row.PmSide === "sell";
}

function isPmBuyRow(row: OrderRow): boolean {
  return isPmRow(row) && !isPmSellRow(row);
}

/** PM 份额：优先 pmShares，已平仓用 attributed，否则由成本/赔率推算 */
function pmSharesText(row: OrderRow): string | null {
  if (!isPmRow(row))
    return null;
  const shares = Number(row.PmShares);
  if (Number.isFinite(shares) && shares > 0.0001)
    return toFixed(shares, 2);
  const attributed = Number(row.PmAttributedSellShares);
  if (Number.isFinite(attributed) && attributed > 0.0001)
    return toFixed(attributed, 2);
  const stakeUsdc = Number(row.PmStakeUsdc);
  const odds = Number(row.Odds);
  if (stakeUsdc > 0 && odds > 1)
    return toFixed(stakeUsdc * odds, 2);
  const betCny = Number(row.BetMoney);
  if (betCny > 0 && odds > 1)
    return toFixed((betCny / USDT_CNY_EXCHANGE) * odds, 2);
  return null;
}

withDefaults(
  defineProps<{
    orderEntries: ReadonlyArray<OrderListEntry>;
    loading?: boolean;
    playerLabel?: (row: OrderRow) => string;
    platformClass?: (row: OrderRow) => string | undefined;
  }>(),
  {
    loading: false,
    playerLabel: () => "",
    platformClass: () => undefined,
  },
);
</script>

<template>
  <div class="orders" :class="{ loading }">
    <fieldset
      v-for="[link, rows] in orderEntries"
      :key="link"
      class="orderlink"
      :class="{ 'orderlink--paired': isArbGroup(rows) }"
      :data-link-id="link"
    >
      <legend :class="orderLegendModifier(rows)">
        {{ orderLegendText(rows) }}
      </legend>
      <div
        v-for="row in rows"
        :key="String(row.OrderID)"
        class="order"
        :class="{
          'order--pm-buy': isPmBuyRow(row),
          'order--pm-sell': isPmSellRow(row),
        }"
      >
        <label class="status" :class="row.Status" />
        <div class="platform flex" :class="platformClass(row)">
          <div class="provider-icon" :class="row.Type" />
          <div class="player">
            {{ playerLabel(row) }}
          </div>
        </div>
        <div class="match" v-html="row.Match" />
        <div class="bet">
          <div class="betname">
            <span
              v-if="isPmRow(row)"
              class="pm-side-tag"
              :class="isPmSellRow(row) ? 'pm-side-tag--sell' : 'pm-side-tag--buy'"
            >{{ isPmSellRow(row) ? "卖单" : "买单" }}</span>
            <span v-html="row.Bet" />
          </div>
          <div class="item">
            <label v-html="row.Item" />
          </div>
        </div>
        <div class="profit">
          <template v-if="isPmSellRow(row)">
            <span v-if="pmSharesText(row)">份额：{{ pmSharesText(row) }} </span>
            赔率：<span class="order__odds">{{
              formatDisplayOdds(Number(row.Odds) || 0)
            }}</span>
            回款金额：{{ toFixed(Number(row.BetMoney) || 0, 0) }}
          </template>
          <template v-else-if="isPmBuyRow(row)">
            <span v-if="pmSharesText(row)">份额：{{ pmSharesText(row) }} </span>
            投注金额：{{ toFixed(Number(row.BetMoney) || 0, 0) }} 赔率：<span class="order__odds">{{
              formatDisplayOdds(Number(row.Odds) || 0)
            }}</span>
            盈亏：{{ toFixed(Number(row.Money) || 0, 0) }}
          </template>
          <template v-else>
            投注金额：{{ toFixed(Number(row.BetMoney) || 0, 0) }} 赔率：<span class="order__odds">{{
              formatDisplayOdds(Number(row.Odds) || 0)
            }}</span>
            盈亏：{{ toFixed(Number(row.Money) || 0, 0) }}
          </template>
        </div>
        <div class="time">
          {{ isPmSellRow(row) ? "平仓时间" : "投注时间" }}：{{ formatOrderTime(row.CreateAt || 0) }}
        </div>
        <div v-if="$slots['row-actions']" class="order-list__row-actions">
          <slot name="row-actions" :row="row" />
        </div>
      </div>
      <div v-if="$slots['group-actions']" class="order-list__group-actions">
        <slot name="group-actions" :link="link" :rows="rows" />
      </div>
    </fieldset>
  </div>
</template>
