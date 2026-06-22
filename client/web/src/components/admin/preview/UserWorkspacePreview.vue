<script setup lang="ts">
import type { AdminOrderRow, AdminUserRow } from "@/types/admin";
import { ElMessage, ElMessageBox } from "element-plus";
import { computed, onMounted, ref, watch } from "vue";
import { deleteAdminOrders, getAdminOrdersAll } from "@/api/admin";
import AccountBar from "@/components/account/AccountBar.vue";
import AccountEditDialog from "@/components/account/AccountEditDialog.vue";
import AdminAccountOrdersColumn from "@/components/admin/AdminAccountOrdersColumn.vue";
import AdminOrderLinkLines from "@/components/admin/AdminOrderLinkLines.vue";
import OrderDateNav from "@/components/order/OrderDateNav.vue";
import { todayKey } from "@/shared/dateKey";
import { useAccountStore } from "@/stores/accountStore";
import { storeToRefs } from "pinia";

const props = defineProps<{
  user: AdminUserRow;
}>();

defineEmits<{ viewOrders: [] }>();

const accountStore = useAccountStore();
const { editDialogOpen, editDialogAccount } = storeToRefs(accountStore);

const date = ref(todayKey());
const loading = ref(false);
const orders = ref<AdminOrderRow[]>([]);
const loadError = ref("");
const columnsContainerRef = ref<HTMLElement | null>(null);

interface ProviderColumn {
  key: string;
  provider: string;
  orders: AdminOrderRow[];
}

const providerColumns = computed<ProviderColumn[]>(() => {
  const byProvider = new Map<string, ProviderColumn>();
  for (const row of orders.value) {
    const key = row.provider;
    if (!byProvider.has(key)) {
      byProvider.set(key, { key, provider: key, orders: [] });
    }
    byProvider.get(key)!.orders.push(row);
  }
  return [...byProvider.values()].sort((a, b) =>
    a.provider.localeCompare(b.provider),
  );
});

const profitTotal = computed(() =>
  orders.value.reduce((sum, r) => sum + (Number(r.money) || 0), 0),
);

const linkLinesKey = computed(() => orders.value.length);

function fmtMoney(n: number) {
  return Math.floor(n).toLocaleString();
}

async function loadOrders() {
  loading.value = true;
  loadError.value = "";
  try {
    const page = await getAdminOrdersAll({ userId: props.user.id, date: date.value });
    orders.value = page.list ?? [];
  }
  catch (e) {
    orders.value = [];
    loadError.value = (e as Error).message || "加载失败";
  }
  finally {
    loading.value = false;
  }
}

async function onDeleteOrders(rows: AdminOrderRow[]) {
  if (!rows.length)
    return;
  const ids = rows.map(r => r.id);
  const label = rows.length > 1
    ? `这 ${rows.length} 笔套利订单（Link ${rows[0]?.linkId || "—"}）`
    : `订单 ${rows[0]?.orderId || ids[0]}`;
  try {
    await ElMessageBox.confirm(`确认删除 ${label}？此操作不可恢复。`, "删除订单", {
      type: "warning",
      confirmButtonText: "删除",
      cancelButtonText: "取消",
    });
  }
  catch {
    return;
  }
  try {
    const res = await deleteAdminOrders(ids);
    ElMessage.success(`已删除 ${res.deleted} 笔订单`);
    await loadOrders();
  }
  catch (e) {
    ElMessage.error((e as Error).message || "删除失败");
  }
}

watch(date, () => void loadOrders());
watch(() => props.user.id, () => void loadOrders());

onMounted(() => void loadOrders());
</script>

<template>
  <div class="user-workspace-preview" v-loading="loading">
    <!-- 顶部投注账号卡片列表 -->
    <AccountEditDialog
      :open="editDialogOpen"
      :account="editDialogAccount"
      readonly
      @close="accountStore.closeAccountDialog()"
    />
    <AccountBar embedded />

    <!-- 工具栏 -->
    <div class="user-workspace-preview__toolbar">
      <OrderDateNav v-model="date" placeholder="日期" />
      <el-button size="small" @click="loadOrders">
        刷新
      </el-button>
      <span v-if="orders.length" class="user-workspace-preview__summary">
        {{ providerColumns.length }} 个场馆 · {{ orders.length }} 笔订单 ·
        利润
        <span :class="{ pos: profitTotal > 0, neg: profitTotal < 0 }">{{ fmtMoney(profitTotal) }}</span>
      </span>
    </div>

    <p v-if="loadError" class="user-workspace-preview__err">
      {{ loadError }}
    </p>

    <!-- 按场馆分列 + LinkID 连线 -->
    <div
      v-if="providerColumns.length"
      ref="columnsContainerRef"
      class="admin-orders-by-account"
    >
      <AdminAccountOrdersColumn
        v-for="col in providerColumns"
        :key="col.key"
        :provider="col.provider"
        :player-id="0"
        :player-name="col.provider"
        :orders="col.orders"
        :accounts="user.accounts ?? []"
        @delete="onDeleteOrders"
      />
      <AdminOrderLinkLines
        :container-ref="columnsContainerRef"
        :key="linkLinesKey"
      />
    </div>

    <p v-if="!loading && !loadError && !providerColumns.length" class="user-workspace-preview__empty">
      {{ date }} 暂无订单
    </p>
  </div>
</template>

<style scoped>
.user-workspace-preview {
  min-height: 400px;
}
.user-workspace-preview__toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 4px 12px;
}
.user-workspace-preview__summary {
  font-size: 13px;
  color: #94a3b8;
}
.user-workspace-preview__err {
  margin: 0;
  padding: 8px 12px;
  font-size: 12px;
  color: #f87171;
  background: rgba(248, 113, 113, 0.08);
  border-bottom: 1px solid rgba(248, 113, 113, 0.2);
}
.user-workspace-preview__empty {
  text-align: center;
  font-size: 13px;
  color: #94a3b8;
  margin: 40px 0;
}
</style>
