<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { getAdminOrders, getAdminUsers } from "@/api/admin";
import type { AdminOrderRow, AdminUserRow } from "@/types/admin";
import { useUserStore } from "@/stores/userStore";

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

const date = ref(String(route.query.date || todayKey()));
const filterUserId = ref(String(route.query.userId || ""));
const filterProvider = ref("");
const loading = ref(false);
const orders = ref<AdminOrderRow[]>([]);
const orderTotal = ref(0);
const orderPage = ref(1);
const orderPageSize = ref(50);
const users = ref<AdminUserRow[]>([]);

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

function todayKey() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function fmtTime(ts: number) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

function fmtMoney(n: number) {
  return Math.floor(n).toLocaleString();
}

function statusType(status: string) {
  const s = status.toLowerCase();
  if (s === "win") return "success";
  if (s === "lose") return "danger";
  if (s === "reject") return "info";
  return "warning";
}

async function loadUsers() {
  users.value = await getAdminUsers(date.value);
}

async function loadOrders() {
  loading.value = true;
  try {
    const page = await getAdminOrders({
      date: date.value,
      pageIndex: orderPage.value,
      pageSize: orderPageSize.value,
      userId: filterUserId.value || undefined,
      provider: filterProvider.value || undefined,
    });
    orders.value = page.list;
    orderTotal.value = page.total;
  } finally {
    loading.value = false;
  }
}

async function refresh() {
  await loadUsers();
  await loadOrders();
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
  orderPage.value = 1;
  syncRouteQuery();
  void loadOrders();
}

watch(date, () => {
  orderPage.value = 1;
  syncRouteQuery();
  void refresh();
});

onMounted(async () => {
  if (!userStore.ready) {
    try {
      await userStore.fetchUserInfo();
    } catch {
      await router.replace({ name: "login", query: { redirect: route.fullPath } });
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
  <div class="admin-page">
    <header class="admin-page__header">
      <div class="admin-page__nav">
        <el-button size="small" @click="router.push({ name: 'admin' })">← 返回管理</el-button>
        <h1 class="admin-page__title">{{ pageTitle }}</h1>
      </div>
      <div class="admin-page__user">
        <span class="admin-page__user-name">{{ userStore.userName }}</span>
      </div>
    </header>
    <main class="admin-page__main admin-page__main--orders">
      <section class="admin-orders-page" v-loading="loading">
        <div class="admin-orders-filters">
          <el-date-picker
            v-model="date"
            type="date"
            value-format="YYYY-MM-DD"
            size="small"
            placeholder="统计日期"
            style="width: 150px"
          />
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
          <el-button size="small" @click="refresh">刷新</el-button>
        </div>
        <el-table :data="orders" size="small" stripe>
          <el-table-column v-if="!filterUserId" label="用户" width="100">
            <template #default="{ row }">
              {{ userNameById.get(row.userId) || row.userId.slice(0, 8) }}
            </template>
          </el-table-column>
          <el-table-column prop="provider" label="平台" width="70" />
          <el-table-column prop="match" label="比赛" min-width="160" show-overflow-tooltip />
          <el-table-column prop="bet" label="盘口" min-width="140" show-overflow-tooltip />
          <el-table-column prop="item" label="选项" width="100" show-overflow-tooltip />
          <el-table-column prop="odds" label="赔率" width="70" />
          <el-table-column label="投注" width="88">
            <template #default="{ row }">{{ fmtMoney(row.betMoney) }}</template>
          </el-table-column>
          <el-table-column label="盈利" width="88">
            <template #default="{ row }">
              <span :class="{ pos: row.money > 0, neg: row.money < 0 }">{{ fmtMoney(row.money) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="80">
            <template #default="{ row }">
              <el-tag size="small" :type="statusType(row.status)">{{ row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="时间" width="160">
            <template #default="{ row }">{{ fmtTime(row.createAt) }}</template>
          </el-table-column>
        </el-table>
        <div class="admin-orders-pager">
          <el-pagination
            v-model:current-page="orderPage"
            :page-size="orderPageSize"
            :total="orderTotal"
            layout="total, prev, pager, next"
            small
            @current-change="loadOrders"
          />
        </div>
      </section>
    </main>
  </div>
</template>
