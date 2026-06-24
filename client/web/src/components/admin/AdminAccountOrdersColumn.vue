<script setup lang="ts">
import type { AdminAccountDetail, AdminOrderRow } from "@/types/admin";
import type { OrderRow } from "@/types/order";
import { computed, ref } from "vue";
import AdminOrderLogsDialog from "@/components/admin/AdminOrderLogsDialog.vue";
import OrderList from "@/components/order/OrderList.vue";
import { adminPlayerLabel, groupAdminOrderEntries } from "@/shared/adminOrderDisplay";

const props = defineProps<{
  provider: string;
  playerId: number;
  playerName: string;
  orders: AdminOrderRow[];
  accounts: AdminAccountDetail[];
}>();

const emit = defineEmits<{
  delete: [rows: AdminOrderRow[]];
}>();

const logsDialogRef = ref<InstanceType<typeof AdminOrderLogsDialog> | null>(null);

const grouped = computed(() => groupAdminOrderEntries(props.orders, props.accounts));

const orderEntries = computed(() =>
  grouped.value.map(({ link, orderRows }) => [link, orderRows] as const),
);

const dayProfit = computed(() =>
  props.orders.reduce((sum, r) => sum + (Number(r.money) || 0), 0),
);

function fmtMoney(n: number) {
  return Math.floor(n).toLocaleString();
}

function playerLabel(row: OrderRow) {
  return adminPlayerLabel(row, props.accounts);
}

function platformClass(row: OrderRow) {
  const acc = props.accounts.find(a => a.accountId === row.PlayerID);
  if (acc?.active)
    return "Stop";
  return undefined;
}

function adminRowsForLink(link: number) {
  return grouped.value.find(entry => entry.link === link)?.adminRows ?? [];
}

function openLogs(rows: AdminOrderRow[]) {
  logsDialogRef.value?.open(rows);
}
</script>

<template>
  <div class="admin-orders-account-col">
    <header class="admin-orders-account-col__head">
      <div class="admin-orders-account-col__title">
        <div class="provider-icon" :class="provider" />
        <h3 class="admin-orders-account-col__name">
          {{ provider }} / {{ playerName || `#${playerId}` }}
        </h3>
      </div>
      <div class="admin-orders-account-col__stats">
        <span
          class="admin-orders-account-col__profit"
          :class="{ pos: dayProfit > 0, neg: dayProfit < 0 }"
        >
          {{ fmtMoney(dayProfit) }}
        </span>
        <span class="admin-orders-account-col__meta">{{ orders.length }} 笔</span>
      </div>
    </header>

    <div v-if="!orderEntries.length" class="admin-orders-account-col__empty">
      暂无订单
    </div>

    <div v-else class="admin-orders-account-col__list">
      <OrderList
        :order-entries="orderEntries"
        :player-label="playerLabel"
        :platform-class="platformClass"
      >
        <template #group-actions="{ link }">
          <div class="admin-orders-account-col__group-actions">
            <el-button link type="primary" size="small" @click="openLogs(adminRowsForLink(link))">
              诊断
            </el-button>
            <el-button
              link
              type="danger"
              size="small"
              @click="emit('delete', adminRowsForLink(link))"
            >
              删除
            </el-button>
          </div>
        </template>
      </OrderList>
    </div>

    <AdminOrderLogsDialog ref="logsDialogRef" />
  </div>
</template>
