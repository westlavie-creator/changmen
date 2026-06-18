<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import AdminLayout from "@/components/admin/AdminLayout.vue";
import AdminOrdersGroupedTable from "@/components/admin/AdminOrdersGroupedTable.vue";
import OrderDateNav from "@/components/order/OrderDateNav.vue";
import { deleteAdminExternalOrders, deleteAdminOrders, getAdminOrdersAll, getAdminUsers } from "@/api/admin";
import type { AdminOrderRow, AdminUserRow } from "@/types/admin";
import { todayKey } from "@/shared/dateKey";
import { useUserStore } from "@/stores/userStore";

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

const date = ref(String(route.query.date || todayKey()));
const filterUserId = ref(String(route.query.userId || ""));
const filterProvider = ref("");
const loading = ref(false);
const orders = ref<AdminOrderRow[]>([]);
const users = ref<AdminUserRow[]>([]);
const loadError = ref("");

const filterUserName = computed(() => {
  const fromQuery = String(route.query.userName || "");
  if (fromQuery) return fromQuery;
  return users.value.find((u) => u.id === filterUserId.value)?.userName || "";
});

const pageTitle = computed(() =>
  filterUserId.value
    ? `${filterUserName.value || "用户"} · 当日订单`
    : "全部订单",
);

const userNameById = computed(() => {
  const map = new Map<string, string>();
  for (const u of users.value) map.set(u.id, u.userName);
  return map;
});

/** 同 LinkID 订单归为一组（无 link 时按行 id 单独成组） */
const orderGroups = computed(() => {
  const map = new Map<number, AdminOrderRow[]>();
  for (const row of orders.value ?? []) {
    const key = row.linkId || row.id;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  }
  return [...map.entries()].sort((a, b) => {
    const ta = Math.max(...a[1].map((r) => r.createAt));
    const tb = Math.max(...b[1].map((r) => r.createAt));
    return tb - ta;
  });
});

const profitTotal = computed(() =>
  orderGroups.value.reduce(
    (sum, [, rows]) => sum + rows.reduce((s, r) => s + (Number(r.money) || 0), 0),
    0,
  ),
);

function fmtMoney(n: number) {
  return Math.floor(n).toLocaleString();
}

async function loadUsers() {
  try {
    users.value = await getAdminUsers(date.value);
  } catch {
    users.value = [];
  }
}

async function loadOrders() {
  loading.value = true;
  loadError.value = "";
  try {
    const page = await getAdminOrdersAll({
      date: date.value,
      userId: filterUserId.value || undefined,
      provider: filterProvider.value || undefined,
    });
    orders.value = page.list ?? [];
  } catch (e) {
    orders.value = [];
    loadError.value = (e as Error).message || "加载失败";
  } finally {
    loading.value = false;
  }
}

async function refresh() {
  await Promise.all([loadUsers(), loadOrders()]);
}

function syncRouteQuery() {
  router.replace({
    name: "admin-orders",
    query: {
      ...(filterUserId.value ? { userId: filterUserId.value } : {}),
      ...(filterUserName.value ? { userName: filterUserName.value } : {}),
      date: date.value,
    },
  });
}

function onSearch() {
  syncRouteQuery();
  void loadOrders();
}

async function onDeleteOrders(rows: AdminOrderRow[]) {
  if (!rows.length) return;
  const ids = rows.map((r) => r.id);
  const label =
    rows.length > 1
      ? `这 ${rows.length} 笔套利订单（Link ${rows[0]?.linkId || "—"}）`
      : `订单 ${rows[0]?.orderId || ids[0]}`;
  try {
    await ElMessageBox.confirm(`确认删除 ${label}？此操作不可恢复。`, "删除订单", {
      type: "warning",
      confirmButtonText: "删除",
      cancelButtonText: "取消",
    });
  } catch {
    return;
  }
  try {
    const res = await deleteAdminOrders(ids);
    ElMessage.success(`已删除 ${res.deleted} 笔订单`);
    await loadOrders();
  } catch (e) {
    ElMessage.error((e as Error).message || "删除失败");
  }
}

async function onDeleteAllExternalOrders() {
  const scopeParts = [date.value];
  if (filterUserId.value) scopeParts.push(filterUserName.value || "指定用户");
  if (filterProvider.value) scopeParts.push(`平台 ${filterProvider.value}`);
  const scope = scopeParts.join(" · ");
  try {
    await ElMessageBox.confirm(
      `将删除 ${scope} 下全部外部订单（官网/未绑定 link，不限当前页）。系统套利与单边订单不受影响。此操作不可恢复。`,
      "删除全部外部订单",
      {
        type: "warning",
        confirmButtonText: "全部删除",
        cancelButtonText: "取消",
      },
    );
  } catch {
    return;
  }
  try {
    const res = await deleteAdminExternalOrders({
      date: date.value,
      userId: filterUserId.value || undefined,
      provider: filterProvider.value || undefined,
    });
    if (!res.deleted) {
      ElMessage.info("没有可删除的外部订单");
    } else {
      ElMessage.success(`已删除 ${res.deleted} 笔外部订单`);
    }
    await loadOrders();
  } catch (e) {
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
    } catch {
      sessionStorage.setItem("gamebet:postLoginRedirect", route.fullPath);
      await router.replace({ name: "home" });
      return;
    }
  }
  if (!userStore.isAdmin) {
    await router.replace({ name: "home" });
    return;
  }
  await refresh();
});
</script>

<template>
  <AdminLayout :title="pageTitle" subtitle="按日期、用户与平台筛选订单">
    <section class="admin-card admin-card--orders" v-loading="loading">
        <div class="admin-card__toolbar admin-orders-filters">
          <OrderDateNav v-model="date" placeholder="统计日期" />
          <el-select
            v-model="filterUserId"
            clearable
            filterable
            placeholder="用户"
            size="small"
            style="width: 180px"
            @change="onSearch"
          >
            <el-option
              v-for="u in users"
              :key="u.id"
              :label="u.userName"
              :value="u.id"
            />
          </el-select>
          <el-input
            v-model="filterProvider"
            clearable
            placeholder="平台 OB/RAY..."
            size="small"
            style="width: 120px"
            @keyup.enter="onSearch"
          />
          <el-button size="small" type="primary" @click="onSearch">查询</el-button>
          <el-button size="small" @click="date = todayKey()">今天</el-button>
          <el-button size="small" @click="refresh">刷新</el-button>
          <el-button
            size="small"
            type="danger"
            plain
            :disabled="loading"
            @click="onDeleteAllExternalOrders"
          >
            删除全部外部订单
          </el-button>
        </div>
        <div class="admin-card__body admin-card__scroll">
        <p v-if="loadError" class="admin-order-groups__empty admin-order-groups__empty--err">
          {{ loadError }}
        </p>
        <div class="admin-order-groups">
          <AdminOrdersGroupedTable
            v-if="orderGroups.length"
            :groups="orderGroups"
            :show-user-column="!filterUserId"
            :user-name-by-id="userNameById"
            @delete="onDeleteOrders"
          />
          <p v-if="!loading && !loadError && !orderGroups.length" class="admin-order-groups__empty">
            {{ date }} 暂无订单。可切换日期查看；若应有数据仍为空，请确认服务器
            <code>GAMEBET_DB_SCRIPT=rds</code> 且已重启后端。
          </p>
        </div>
        </div>
        <div v-if="orderGroups.length" class="admin-orders-profit-summary">
          <span class="admin-orders-profit-summary__label">利润合计</span>
          <span
            class="admin-orders-profit-summary__value"
            :class="{ pos: profitTotal > 0, neg: profitTotal < 0 }"
          >
            {{ fmtMoney(profitTotal) }}
          </span>
          <span class="admin-orders-profit-summary__meta">
            {{ orderGroups.length }} 个 Link · {{ orders.length }} 笔订单
          </span>
        </div>
      </section>
  </AdminLayout>
</template>
