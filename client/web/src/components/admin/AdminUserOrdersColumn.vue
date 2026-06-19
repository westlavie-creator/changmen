<script setup lang="ts">
import { computed, ref } from "vue";
import type { AdminAccountDetail, AdminOrderRow } from "@/types/admin";
import AdminOrderLogsDialog from "@/components/admin/AdminOrderLogsDialog.vue";
import {
  adminPlayerLabel,
  groupAdminOrderEntries,
  isArbGroup,
  orderLegendClass,
  orderLegendText,
} from "@/shared/adminOrderDisplay";
import { formatDisplayOdds, formatOrderTime, toFixed } from "@/shared/format";

const props = defineProps<{
  userName: string;
  accounts: AdminAccountDetail[];
  orders: AdminOrderRow[];
}>();

const emit = defineEmits<{
  delete: [rows: AdminOrderRow[]];
}>();

const logsDialogRef = ref<InstanceType<typeof AdminOrderLogsDialog> | null>(null);

const orderEntries = computed(() => groupAdminOrderEntries(props.orders));

const dayProfit = computed(() =>
  props.orders.reduce((sum, r) => sum + (Number(r.money) || 0), 0),
);

function fmtMoney(n: number) {
  return Math.floor(n).toLocaleString();
}

function openLogs(rows: AdminOrderRow[]) {
  logsDialogRef.value?.open(rows);
}
</script>

<template>
  <div class="admin-orders-user-col">
    <header class="admin-orders-user-col__head">
      <h3 class="admin-orders-user-col__name">{{ userName }}</h3>
      <span
        class="admin-orders-user-col__profit"
        :class="{ pos: dayProfit > 0, neg: dayProfit < 0 }"
      >
        {{ fmtMoney(dayProfit) }}
      </span>
      <span class="admin-orders-user-col__meta">{{ orders.length }} 笔</span>
    </header>

    <div v-if="!orderEntries.length" class="admin-orders-user-col__empty">暂无订单</div>

    <div v-else class="orders admin-orders-user-col__orders">
      <fieldset
        v-for="{ link, orderRows, adminRows } in orderEntries"
        :key="`${userName}-${link}`"
        class="orderlink"
        :class="{ 'orderlink--paired': isArbGroup(orderRows) }"
      >
        <legend :class="orderLegendClass(orderRows)">
          {{ orderLegendText(orderRows) }}
        </legend>
        <div
          v-for="row in orderRows"
          :key="String(row.OrderID)"
          class="order"
        >
          <label class="status" :class="row.Status" />
          <div class="platform flex">
            <div class="provider-icon" :class="row.Type" />
            <div class="player">{{ adminPlayerLabel(row, accounts) }}</div>
          </div>
          <div class="match" v-html="row.Match" />
          <div class="bet">
            <div class="betname" v-html="row.Bet" />
            <div class="item">
              <label v-html="row.Item" />
            </div>
          </div>
          <div class="profit">
            投注金额：{{ row.BetMoney }} 赔率：<span class="order__odds">{{
              formatDisplayOdds(Number(row.Odds) || 0)
            }}</span>
            盈亏：{{ toFixed(Number(row.Money) || 0, 0) }}
          </div>
          <div class="time">投注时间：{{ formatOrderTime(row.CreateAt || 0) }}</div>
        </div>
        <div class="admin-orders-user-col__group-actions">
          <el-button link type="primary" size="small" @click="openLogs(adminRows)">
            诊断
          </el-button>
          <el-button link type="danger" size="small" @click="emit('delete', adminRows)">
            删除
          </el-button>
        </div>
      </fieldset>
    </div>

    <AdminOrderLogsDialog ref="logsDialogRef" />
  </div>
</template>

<style scoped>
.admin-orders-user-col {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--adm-border, rgba(120, 140, 175, 0.25));
  border-radius: 8px;
  background: var(--adm-surface-2, rgba(255, 255, 255, 0.03));
  overflow: visible;
}

.admin-orders-user-col__head {
  flex: 0 0 auto;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 10px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--adm-border, rgba(120, 140, 175, 0.25));
}

.admin-orders-user-col__name {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.admin-orders-user-col__profit {
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.admin-orders-user-col__profit.pos {
  color: #67c23a;
}

.admin-orders-user-col__profit.neg {
  color: #f56c6c;
}

.admin-orders-user-col__meta {
  width: 100%;
  font-size: 11px;
  color: var(--adm-text-muted, #94a3b8);
}

.admin-orders-user-col__empty {
  flex: 1 1 auto;
  padding: 24px 12px;
  text-align: center;
  font-size: 12px;
  color: var(--adm-text-muted, #94a3b8);
}

.admin-orders-user-col__orders {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  overflow: visible;
  padding: 6px 4px 8px;
  white-space: normal;
  font-size: 12px;
  color: #fff;
}

.admin-orders-user-col__orders :deep(.orderlink) {
  display: block;
  width: 100%;
  flex: 0 0 auto;
  margin-bottom: 10px;
  box-sizing: border-box;
}

.admin-orders-user-col__orders :deep(.order) {
  display: block;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

.admin-orders-user-col__group-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  padding: 4px 6px 6px;
  border-top: 1px dashed var(--adm-border, rgba(120, 140, 175, 0.25));
}
</style>
