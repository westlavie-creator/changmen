<script setup lang="ts">
import type { OrderRow } from "@/types/order";
import { formatDisplayOdds, formatOrderTime, toFixed } from "@/shared/format";
import {
  isArbGroup,
  orderLegendModifier,
  orderLegendText,
} from "@/shared/orderDisplay";
import {
  pmRowDisplayProfitCny,
  pmRowDisplayStatus,
} from "@/shared/orderLink";

export type OrderListEntry = readonly [number, OrderRow[]];

function isPmRow(row: OrderRow): boolean {
  return String(row.Type ?? "") === "Polymarket";
}

/** PM 份额：仅展示 RDS 中的 PmShares（来自 Polymarket API），不推算 */
function pmSharesText(row: OrderRow): string | null {
  if (!isPmRow(row))
    return null;
  const shares = Number(row.PmShares);
  if (!Number.isFinite(shares) || shares <= 0.0001)
    return null;
  return toFixed(shares, 2);
}

function rowStatus(row: OrderRow, groupRows: OrderRow[]) {
  return isPmRow(row) ? pmRowDisplayStatus(row, groupRows) : row.Status;
}

function rowProfit(row: OrderRow, groupRows: OrderRow[]) {
  return isPmRow(row)
    ? pmRowDisplayProfitCny(row, groupRows)
    : (Number(row.Money) || 0);
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
      >
        <label class="status" :class="rowStatus(row, rows)" />
        <div class="platform flex" :class="platformClass(row)">
          <div class="provider-icon" :class="row.Type" />
          <div class="player">
            {{ playerLabel(row) }}
          </div>
        </div>
        <div class="match" v-html="row.Match" />
        <div class="bet">
          <div class="betname">
            <span v-html="row.Bet" />
          </div>
          <div class="item">
            <label v-html="row.Item" />
          </div>
        </div>
        <div class="profit">
          <span v-if="pmSharesText(row)">份额：{{ pmSharesText(row) }} </span>
          投注金额：{{ toFixed(Number(row.BetMoney) || 0, 0) }} 赔率：<span class="order__odds">{{
            formatDisplayOdds(Number(row.Odds) || 0)
          }}</span>
          盈亏：{{ toFixed(rowProfit(row, rows), 0) }}
        </div>
        <div class="time">
          投注时间：{{ formatOrderTime(row.CreateAt || 0) }}
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
