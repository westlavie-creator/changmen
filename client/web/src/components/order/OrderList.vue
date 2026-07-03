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

/** 卖单对应成本（CNY）；优先 pmStakeUsdc，否则由回款 − 盈亏反推 */
function pmSellCostCny(row: OrderRow): number {
  const costUsdc = Number(row.PmStakeUsdc) || 0;
  if (costUsdc > 0)
    return Math.round(costUsdc * USDT_CNY_EXCHANGE);
  const proceeds = Number(row.BetMoney) || 0;
  const profit = Number(row.Money) || 0;
  return Math.round(proceeds - profit);
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
            回款：{{ toFixed(Number(row.BetMoney) || 0, 0) }}
            成本：{{ toFixed(pmSellCostCny(row), 0) }}
            赔率：<span class="order__odds">{{
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
