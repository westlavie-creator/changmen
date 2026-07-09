<script setup lang="ts">
import { ElMessageBox } from "element-plus";
import type { OrderRow } from "@/types/order";
import { formatDisplayOdds, formatOrderTime, toFixed } from "@/shared/format";
import {
  isPmOrderListRow,
  pmOrderFillPriceText,
  pmOrderOddsText,
  pmOrderSharesText,
} from "@/shared/pmOrderDisplay";
import {
  isArbGroup,
  orderLegendModifier,
  orderLegendText,
} from "@/shared/orderDisplay";
import {
  formatLinkIdFull,
  groupHasUnboundPlaceholder,
  resolveOrderGroupKindBadge,
} from "@/shared/linkDisplay";
import {
  isMakeupCancelledOrderRow,
  isMakeupPendingOrderRow,
  makeupBetIdFromPendingRow,
  makeupPendingProfitLabel,
  orderListDisplayRows,
} from "@/shared/orderLink";

export type OrderListEntry = readonly [number, OrderRow[]];

const emit = defineEmits<{
  cancelMakeup: [betId: number];
}>();

function isPendingRow(row: OrderRow): boolean {
  if (isMakeupPendingOrderRow(row) || isMakeupCancelledOrderRow(row))
    return false;
  return String(row.Status ?? "") === "None";
}

function onCancelMakeup(row: OrderRow) {
  const betId = makeupBetIdFromPendingRow(row);
  if (!betId)
    return;
  ElMessageBox.confirm("确认要取消补单吗？", "补单取消", {
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    type: "warning",
  })
    .then(() => {
      emit("cancelMakeup", betId);
    })
    .catch(() => {});
}

function linkKind(rows: OrderRow[]) {
  return resolveOrderGroupKindBadge(rows);
}

function showExtraUnboundTag(rows: OrderRow[]): boolean {
  return groupHasUnboundPlaceholder(rows) && linkKind(rows)?.source !== "hash";
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
        :class="{
          'orderlink--paired': isArbGroup(rows),
          'orderlink--unbound': groupHasUnboundPlaceholder(rows),
        }"
        :data-link-id="link"
      >
        <legend :class="orderLegendModifier(rows)">
          <span
            v-if="linkKind(rows)"
            class="orderlink__tag"
            :class="`orderlink__tag--${linkKind(rows)!.source}`"
            :title="`${linkKind(rows)!.title} · ${formatLinkIdFull(link)}`"
          >{{ linkKind(rows)!.label }}</span>
          <span
            v-if="showExtraUnboundTag(rows)"
            class="orderlink__tag orderlink__tag--hash"
            title="本组仍有占位 Link，绑单确认前短暂态"
          >未绑单</span>
          {{ orderLegendText(rows) }}
        </legend>
        <div
          v-for="row in orderListDisplayRows(rows)"
          :key="String(row.OrderID)"
          class="order"
        >
          <div
            v-if="isMakeupPendingOrderRow(row)"
            class="order__status-anchor"
          >
            <i
              class="order__makeup-close"
              title="取消补单"
              role="button"
              @click="onCancelMakeup(row)"
            />
            <label class="status" :class="row.Status" />
          </div>
          <label v-else class="status" :class="row.Status" />
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
            <template v-if="isPmOrderListRow(row)">
              <div class="order__profit-line">
                <span v-if="pmOrderSharesText(row)">份额：{{ pmOrderSharesText(row) }} </span>
                <span v-if="pmOrderFillPriceText(row)">价格：{{ pmOrderFillPriceText(row) }} </span>
                赔率：<span class="order__odds">{{ pmOrderOddsText(row) }}</span>
              </div>
              <div class="order__profit-line">
                投注金额：{{ toFixed(Number(row.BetMoney) || 0, 0) }}
                <template v-if="isPendingRow(row)">
                  盈亏：待结算
                </template>
                <template v-else>
                  盈亏：{{ toFixed(Number(row.Money) || 0, 0) }}
                </template>
              </div>
            </template>
            <template v-else>
              投注金额：{{ toFixed(Number(row.BetMoney) || 0, 0) }} 赔率：<span class="order__odds">{{
                formatDisplayOdds(Number(row.Odds) || 0)
              }}</span>
              <template v-if="isMakeupPendingOrderRow(row)">
                盈亏：{{ makeupPendingProfitLabel(row) }}
              </template>
              <template v-else-if="isMakeupCancelledOrderRow(row)">
                盈亏：补单已手动取消
              </template>
              <template v-else-if="isPendingRow(row)">
                盈亏：待结算
              </template>
              <template v-else>
                盈亏：{{ toFixed(Number(row.Money) || 0, 0) }}
              </template>
            </template>
          </div>
          <div class="time">
            投注时间：{{ formatOrderTime(row.CreateAt || 0) }}
          </div>
        </div>
        <div v-if="$slots['group-actions']" class="order-list__group-actions">
          <slot name="group-actions" :link="link" :rows="rows" />
        </div>
      </fieldset>
    </template>
  </div>
</template>
