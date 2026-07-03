<script setup lang="ts">
import type { OrderRow } from "@/types/order";
import { formatDisplayOdds, formatOrderTime, toFixed } from "@/shared/format";
import {
  isArbGroup,
  orderLegendModifier,
  orderLegendText,
} from "@/shared/orderDisplay";
import {
  orderListDisplayRows,
  pmBuyBoundSellFills,
  pmBuyDisplayStatus,
  pmBuyProfitDisplay,
  type PmBoundSellFillLine,
} from "@/shared/orderLink";

export type OrderListEntry = readonly [number, OrderRow[]];

function isPmBuyRow(row: OrderRow): boolean {
  return String(row.Type ?? "") === "Polymarket" && row.PmSide !== "sell";
}

/** PM 份额：仅展示 RDS 中的 PmShares（来自 Polymarket API），不推算 */
function pmSharesText(row: OrderRow): string | null {
  if (!isPmBuyRow(row))
    return null;
  const shares = Number(row.PmShares);
  if (!Number.isFinite(shares) || shares <= 0.0001)
    return null;
  return toFixed(shares, 2);
}

function rowStatus(row: OrderRow, groupRows: OrderRow[]) {
  return isPmBuyRow(row) ? pmBuyDisplayStatus(row, groupRows) : row.Status;
}

function pmBuyUi(row: OrderRow, groupRows: OrderRow[]) {
  return {
    profit: pmBuyProfitDisplay(row, groupRows),
    fills: pmBuyBoundSellFills(row, groupRows),
  };
}

function sellFillSharesText(fill: PmBoundSellFillLine): string | null {
  if (fill.shares == null)
    return null;
  return toFixed(fill.shares, 2);
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
    <template v-for="[link, rows] in orderEntries" :key="link">
      <fieldset
        v-if="orderListDisplayRows(rows).length"
        class="orderlink"
        :class="{ 'orderlink--paired': isArbGroup(rows) }"
        :data-link-id="link"
      >
        <legend :class="orderLegendModifier(rows)">
          {{ orderLegendText(rows) }}
        </legend>
        <div
          v-for="row in orderListDisplayRows(rows)"
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
            <template v-if="isPmBuyRow(row)">
              <template v-for="ui in [pmBuyUi(row, rows)]" :key="'pm-ui'">
                <template v-if="ui.profit.pending">
                  盈亏：待结算
                </template>
                <template v-else>
                  盈亏：{{ toFixed(ui.profit.profitCny, 0) }}
                  <span v-if="ui.profit.earlySettled" class="pm-bound-sell">（已平仓）</span>
                </template>
              </template>
            </template>
            <template v-else>
              盈亏：{{ toFixed(Number(row.Money) || 0, 0) }}
            </template>
          </div>
          <div class="time">
            投注时间：{{ formatOrderTime(row.CreateAt || 0) }}
          </div>
          <template v-if="isPmBuyRow(row)">
            <template v-for="ui in [pmBuyUi(row, rows)]" :key="'pm-fills'">
              <div
                v-if="ui.fills.length"
                class="pm-sell-fills"
              >
                <div
                  v-for="(fill, idx) in ui.fills"
                  :key="`${fill.createAt}-${idx}`"
                  class="pm-sell-fills__block"
                >
                  <div class="pm-sell-fills__title">
                    平仓成交{{ ui.fills.length > 1 ? idx + 1 : "" }}
                  </div>
                  <div class="pm-sell-fills__detail">
                    <span v-if="sellFillSharesText(fill)">份额：{{ sellFillSharesText(fill) }} </span>
                    回款：{{ toFixed(fill.proceedsCny, 0) }}
                    赔率：<span class="order__odds">{{ formatDisplayOdds(fill.odds) }}</span>
                  </div>
                  <div class="pm-sell-fills__time">
                    平仓时间：{{ formatOrderTime(fill.createAt) }}
                  </div>
                </div>
              </div>
            </template>
          </template>
          <div v-if="$slots['row-actions']" class="order-list__row-actions">
            <slot name="row-actions" :row="row" />
          </div>
        </div>
        <div v-if="$slots['group-actions']" class="order-list__group-actions">
          <slot name="group-actions" :link="link" :rows="rows" />
        </div>
      </fieldset>
    </template>
  </div>
</template>

<style scoped>
.pm-bound-sell {
  margin-left: 2px;
  font-size: 11px;
  color: var(--el-text-color-secondary, #999);
}

.pm-sell-fills {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed var(--el-border-color-lighter, #dcdfe6);
  font-size: 11px;
  line-height: 1.45;
  color: var(--el-text-color-regular, #606266);
}

.pm-sell-fills__block + .pm-sell-fills__block {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dotted var(--el-border-color-extra-light, #ebeef5);
}

.pm-sell-fills__title {
  color: var(--el-text-color-secondary, #909399);
  margin-bottom: 2px;
}

.pm-sell-fills__detail {
  word-break: break-word;
}

.pm-sell-fills__time {
  margin-top: 2px;
  color: var(--el-text-color-secondary, #909399);
}
</style>
