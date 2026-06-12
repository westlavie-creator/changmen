<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { getAdminDashboard, getAdminOrders, getAdminUsers } from "@/api/admin";
import type { AdminDashboard, AdminOrderRow, AdminUserRow } from "@/types/admin";

const tab = ref<"overview" | "users" | "orders">("overview");
const date = ref(todayKey());
const loading = ref(false);
const dashboard = ref<AdminDashboard | null>(null);
const users = ref<AdminUserRow[]>([]);
const orders = ref<AdminOrderRow[]>([]);
const orderTotal = ref(0);
const orderPage = ref(1);
const orderPageSize = ref(50);
const filterUserId = ref("");
const filterProvider = ref("");
const expandedUserId = ref<string | null>(null);

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

async function loadOverview() {
  dashboard.value = await getAdminDashboard(date.value);
}

async function loadUsers() {
  users.value = await getAdminUsers(date.value);
}

async function loadOrders() {
  const page = await getAdminOrders({
    date: date.value,
    pageIndex: orderPage.value,
    pageSize: orderPageSize.value,
    userId: filterUserId.value || undefined,
    provider: filterProvider.value || undefined,
  });
  orders.value = page.list;
  orderTotal.value = page.total;
}

async function loadActive() {
  loading.value = true;
  try {
    if (tab.value === "overview") await loadOverview();
    else if (tab.value === "users") await loadUsers();
    else {
      if (!users.value.length) await loadUsers();
      await loadOrders();
    }
  } finally {
    loading.value = false;
  }
}

function refresh() {
  void loadActive();
}

function onUserRowClick(row: AdminUserRow) {
  expandedUserId.value = expandedUserId.value === row.id ? null : row.id;
  filterUserId.value = row.id;
  if (tab.value !== "orders") {
    tab.value = "orders";
    orderPage.value = 1;
    void loadOrders();
  }
}

watch([tab, date], () => {
  void loadActive();
});

onMounted(() => {
  void loadActive();
});
</script>

<template>
  <section class="admin-panel" v-loading="loading">
    <div class="admin-panel__head">
      <div class="admin-panel__tools">
        <el-date-picker
          v-model="date"
          type="date"
          value-format="YYYY-MM-DD"
          size="small"
          placeholder="统计日期"
          style="width: 150px"
        />
        <el-button size="small" @click="refresh">刷新</el-button>
      </div>
    </div>

    <el-tabs v-model="tab" class="admin-panel__tabs">
      <el-tab-pane label="概览" name="overview">
        <div v-if="dashboard" class="admin-stats">
          <div class="admin-stat">
            <div class="admin-stat__label">注册用户</div>
            <div class="admin-stat__value">{{ dashboard.userCount }}</div>
          </div>
          <div class="admin-stat">
            <div class="admin-stat__label">当日活跃</div>
            <div class="admin-stat__value">{{ dashboard.activeUsersToday }}</div>
          </div>
          <div class="admin-stat">
            <div class="admin-stat__label">当日订单</div>
            <div class="admin-stat__value">{{ dashboard.orderCount }}</div>
          </div>
          <div class="admin-stat">
            <div class="admin-stat__label">当日盈利</div>
            <div class="admin-stat__value" :class="{ pos: dashboard.totalMoney > 0, neg: dashboard.totalMoney < 0 }">
              {{ fmtMoney(dashboard.totalMoney) }}
            </div>
          </div>
          <div class="admin-stat">
            <div class="admin-stat__label">当日流水</div>
            <div class="admin-stat__value">{{ fmtMoney(dashboard.totalBetMoney) }}</div>
          </div>
        </div>
        <div v-if="dashboard?.topProfit?.length" class="admin-top">
          <div class="admin-top__title">当日盈利 TOP</div>
          <el-table :data="dashboard.topProfit" size="small" stripe>
            <el-table-column prop="UserName" label="用户" min-width="120" />
            <el-table-column label="盈利" width="100">
              <template #default="{ row }">{{ fmtMoney(row.Money) }}</template>
            </el-table-column>
            <el-table-column prop="Count" label="订单" width="80" />
            <el-table-column label="流水" width="100">
              <template #default="{ row }">{{ fmtMoney(row.BetMoney ?? 0) }}</template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <el-tab-pane label="用户" name="users">
        <el-table
          :data="users"
          size="small"
          stripe
          highlight-current-row
          @row-click="onUserRowClick"
        >
          <el-table-column prop="userName" label="用户名" min-width="120" />
          <el-table-column prop="accountCount" label="账号数" width="80" />
          <el-table-column label="当日盈利" width="100">
            <template #default="{ row }">
              <span :class="{ pos: row.todayMoney > 0, neg: row.todayMoney < 0 }">
                {{ fmtMoney(row.todayMoney) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="todayCount" label="订单" width="70" />
          <el-table-column label="流水" width="100">
            <template #default="{ row }">{{ fmtMoney(row.todayBetMoney) }}</template>
          </el-table-column>
          <el-table-column label="注册时间" min-width="160">
            <template #default="{ row }">{{ fmtTime(row.createdAt) }}</template>
          </el-table-column>
        </el-table>
        <div v-if="expandedUserId" class="admin-user-detail">
          <template v-for="u in users" :key="u.id">
            <div v-if="u.id === expandedUserId">
              <div class="admin-user-detail__title">{{ u.userName }} 的平台账号</div>
              <el-table :data="u.accounts" size="small">
                <el-table-column prop="platform" label="平台" width="80" />
                <el-table-column prop="accountId" label="账号ID" width="100" />
                <el-table-column prop="playerName" label="昵称" min-width="120" />
                <el-table-column label="余额" width="100">
                  <template #default="{ row }">{{ fmtMoney(row.balance ?? 0) }}</template>
                </el-table-column>
              </el-table>
            </div>
          </template>
        </div>
      </el-tab-pane>

      <el-tab-pane label="订单" name="orders">
        <div class="admin-orders-filters">
          <el-select
            v-model="filterUserId"
            clearable
            filterable
            placeholder="用户"
            size="small"
            style="width: 180px"
          >
            <el-option
              v-for="u in users.length ? users : []"
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
          />
          <el-button size="small" type="primary" @click="orderPage = 1; loadOrders()">查询</el-button>
        </div>
        <el-table :data="orders" size="small" stripe max-height="420">
          <el-table-column label="用户" width="100">
            <template #default="{ row }">
              {{ userNameById.get(row.userId) || row.userId.slice(0, 8) }}
            </template>
          </el-table-column>
          <el-table-column prop="provider" label="平台" width="70" />
          <el-table-column prop="match" label="比赛" min-width="140" show-overflow-tooltip />
          <el-table-column prop="bet" label="盘口" min-width="120" show-overflow-tooltip />
          <el-table-column prop="item" label="选项" width="90" show-overflow-tooltip />
          <el-table-column prop="odds" label="赔率" width="70" />
          <el-table-column label="投注" width="80">
            <template #default="{ row }">{{ fmtMoney(row.betMoney) }}</template>
          </el-table-column>
          <el-table-column label="盈利" width="80">
            <template #default="{ row }">
              <span :class="{ pos: row.money > 0, neg: row.money < 0 }">{{ fmtMoney(row.money) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="80">
            <template #default="{ row }">
              <el-tag size="small" :type="statusType(row.status)">{{ row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="时间" width="150">
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
      </el-tab-pane>
    </el-tabs>
  </section>
</template>
