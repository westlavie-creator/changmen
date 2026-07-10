<script setup lang="ts">
import type { AdminAccountDetail, AdminOrderRow } from "@/types/admin";
import type { OrderRow } from "@/types/order";
import { computed, ref, watch } from "vue";
import AdminOrderLogsDialog from "@/components/admin/AdminOrderLogsDialog.vue";
import OrderList from "@/components/order/OrderList.vue";
import { adminPlayerLabel, groupAdminOrderEntries } from "@/shared/adminOrderDisplay";

const props = defineProps<{
  userName: string;
  accounts: AdminAccountDetail[];
  orders: AdminOrderRow[];
}>();

const emit = defineEmits<{
  delete: [rows: AdminOrderRow[]];
}>();

const logsDialogRef = ref<InstanceType<typeof AdminOrderLogsDialog> | null>(null);
const filterPlayerId = ref<number | null>(null);

const accountOptions = computed(() =>
  [...props.accounts]
    .map(acc => {
      const platform = acc.platformName || acc.platform || "—";
      const name = acc.playerName || `#${acc.accountId}`;
      return {
        value: Number(acc.accountId),
        label: `${platform} / ${name}`,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "zh-CN")),
);

const visibleOrders = computed(() => {
  if (!filterPlayerId.value)
    return props.orders;
  return props.orders.filter(r => Number(r.playerId) === Number(filterPlayerId.value));
});

const grouped = computed(() => groupAdminOrderEntries(visibleOrders.value, props.accounts));

const orderEntries = computed(() =>
  grouped.value.map(({ link, orderRows }) => [link, orderRows] as const),
);

const dayProfit = computed(() =>
  visibleOrders.value.reduce((sum, r) => sum + (Number(r.money) || 0), 0),
);

watch(
  () => props.accounts.map(a => a.accountId).join(","),
  () => {
    if (
      filterPlayerId.value
      && !props.accounts.some(a => Number(a.accountId) === Number(filterPlayerId.value))
    ) {
      filterPlayerId.value = null;
    }
  },
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

function adminRowForOrder(row: OrderRow) {
  const oid = String(row.OrderID ?? "");
  return visibleOrders.value.find(o => o.orderId === oid);
}

function openLogs(rows: AdminOrderRow[]) {
  logsDialogRef.value?.open(rows);
}

function onDeleteOne(row: OrderRow) {
  const admin = adminRowForOrder(row);
  if (admin)
    emit("delete", [admin]);
}

function onDeleteGroup(link: number) {
  const rows = adminRowsForLink(link);
  if (rows.length)
    emit("delete", rows);
}
</script>

<template>
  <div class="admin-orders-user-col">
    <header class="admin-orders-user-col__head">
      <div class="admin-orders-user-col__title-row">
        <h3 class="admin-orders-user-col__name">
          {{ userName }}
        </h3>
        <el-select
          v-if="accountOptions.length"
          v-model="filterPlayerId"
          clearable
          filterable
          placeholder="全部账号"
          size="small"
          class="admin-orders-user-col__account-filter"
        >
          <el-option
            v-for="opt in accountOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
      </div>
      <span
        class="admin-orders-user-col__profit"
        :class="{ pos: dayProfit > 0, neg: dayProfit < 0 }"
      >
        {{ fmtMoney(dayProfit) }}
      </span>
      <span class="admin-orders-user-col__meta">{{ visibleOrders.length }} 笔</span>
    </header>

    <div v-if="!orderEntries.length" class="admin-orders-user-col__empty">
      {{ filterPlayerId ? "该账号暂无订单" : "暂无订单" }}
    </div>

    <div v-else class="admin-orders-user-col__list">
      <OrderList
        :order-entries="orderEntries"
        :player-label="playerLabel"
        :platform-class="platformClass"
      >
        <template #row-actions="{ row }">
          <el-button
            link
            type="danger"
            size="small"
            @click="onDeleteOne(row)"
          >
            删除
          </el-button>
        </template>
        <template #group-actions="{ link, rows }">
          <div class="admin-orders-user-col__group-actions">
            <el-button link type="primary" size="small" @click="openLogs(adminRowsForLink(link))">
              诊断
            </el-button>
            <el-button
              v-if="rows.length > 1"
              link
              type="danger"
              size="small"
              @click="onDeleteGroup(link)"
            >
              删除组
            </el-button>
          </div>
        </template>
      </OrderList>
    </div>

    <AdminOrderLogsDialog ref="logsDialogRef" />
  </div>
</template>
