<script setup lang="ts">
import type { AdminOrderRow, AdminUserRow } from "@/types/admin";
import { ElMessage, ElMessageBox } from "element-plus";
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { deleteAdminOrders, getAdminOrdersAll, getAdminUsers } from "@/api/admin";
import AdminLayout from "@/components/admin/AdminLayout.vue";
import AdminUserOrdersColumn from "@/components/admin/AdminUserOrdersColumn.vue";
import OrderDateNav from "@/components/order/OrderDateNav.vue";
import { todayKey } from "@/shared/dateKey";
import { useUserStore } from "@/stores/userStore";

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

const date = ref(String(route.query.date || todayKey()));
const filterProvider = ref("");
const loading = ref(false);
const orders = ref<AdminOrderRow[]>([]);
const users = ref<AdminUserRow[]>([]);
const loadError = ref("");

const userColumns = computed(() => {
  const byUser = new Map<string, AdminOrderRow[]>();
  for (const row of orders.value) {
    if (!byUser.has(row.userId))
      byUser.set(row.userId, []);
    byUser.get(row.userId)!.push(row);
  }

  const userById = new Map(users.value.map(u => [u.id, u]));
  const cols = users.value.map(user => ({
    userId: user.id,
    userName: user.userName,
    accounts: user.accounts ?? [],
    orders: byUser.get(user.id) ?? [],
  }));

  for (const [userId, userOrders] of byUser) {
    if (userById.has(userId))
      continue;
    cols.push({
      userId,
      userName: userId.slice(0, 8),
      accounts: [],
      orders: userOrders,
    });
  }

  cols.sort((a, b) => a.userName.localeCompare(b.userName, "zh-CN"));
  return cols;
});

const hasUsers = computed(() => users.value.length > 0);

const profitTotal = computed(() =>
  orders.value.reduce((sum, r) => sum + (Number(r.money) || 0), 0),
);

function fmtMoney(n: number) {
  return Math.floor(n).toLocaleString();
}

async function loadUsers() {
  try {
    users.value = await getAdminUsers(date.value);
  }
  catch {
    users.value = [];
  }
}

async function loadOrders() {
  loading.value = true;
  loadError.value = "";
  try {
    const page = await getAdminOrdersAll({
      date: date.value,
      provider: filterProvider.value || undefined,
    });
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

async function refresh() {
  await Promise.all([loadUsers(), loadOrders()]);
}

function syncRouteQuery() {
  router.replace({
    name: "admin-orders",
    query: { date: date.value },
  });
}

function onSearch() {
  syncRouteQuery();
  void loadOrders();
}

async function onDeleteOrders(rows: AdminOrderRow[]) {
  if (!rows.length)
    return;
  const ids = rows.map(r => r.id);
  const label
    = rows.length > 1
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

watch(date, () => {
  syncRouteQuery();
  void refresh();
});

onMounted(async () => {
  if (!userStore.ready) {
    try {
      await userStore.fetchUserInfo();
    }
    catch {
      sessionStorage.setItem("gamebet:postLoginRedirect", route.fullPath);
      await router.replace({ name: "home" });
      return;
    }
  }
  if (!userStore.canAccessAdmin) {
    await router.replace({ name: "home" });
    return;
  }
  await refresh();
});
</script>

<template>
  <AdminLayout title="订单查询" subtitle="每位用户一列，订单按 Link 分组展示">
    <section v-loading="loading" class="admin-card admin-card--orders">
      <div class="admin-card__toolbar admin-orders-filters">
        <OrderDateNav v-model="date" placeholder="统计日期" />
        <el-input
          v-model="filterProvider"
          clearable
          placeholder="平台 OB/RAY..."
          size="small"
          style="width: 120px"
          @keyup.enter="onSearch"
        />
        <el-button size="small" type="primary" @click="onSearch">
          查询
        </el-button>
        <el-button size="small" @click="date = todayKey()">
          今天
        </el-button>
        <el-button size="small" @click="refresh">
          刷新
        </el-button>
      </div>

      <div class="admin-card__body admin-orders-page__body">
        <p v-if="loadError" class="admin-order-groups__empty admin-order-groups__empty--err">
          {{ loadError }}
        </p>

        <div v-if="hasUsers" class="admin-orders-by-user">
          <AdminUserOrdersColumn
            v-for="col in userColumns"
            :key="col.userId"
            class="admin-orders-by-user__col"
            :user-name="col.userName"
            :accounts="col.accounts"
            :orders="col.orders"
            @delete="onDeleteOrders"
          />
        </div>

        <p
          v-if="!loading && !loadError && !hasUsers"
          class="admin-order-groups__empty"
        >
          {{ date }} 暂无订单。可切换日期查看；若应有数据仍为空，请确认服务器
          <code>GAMEBET_DB_SCRIPT=rds</code> 且已重启后端。
        </p>
      </div>

      <div v-if="hasUsers" class="admin-orders-profit-summary">
        <span class="admin-orders-profit-summary__label">利润合计</span>
        <span
          class="admin-orders-profit-summary__value"
          :class="{ pos: profitTotal > 0, neg: profitTotal < 0 }"
        >
          {{ fmtMoney(profitTotal) }}
        </span>
        <span class="admin-orders-profit-summary__meta">
          {{ userColumns.length }} 位用户 · {{ orders.length }} 笔订单
        </span>
      </div>
    </section>
  </AdminLayout>
</template>
