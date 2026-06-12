<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { getAdminDashboard, getAdminUsers } from "@/api/admin";
import AdminUserDetail from "@/components/admin/AdminUserDetail.vue";
import type { AdminDashboard, AdminUserRow } from "@/types/admin";

const router = useRouter();
const date = ref(todayKey());
const loading = ref(false);
const dashboard = ref<AdminDashboard | null>(null);
const users = ref<AdminUserRow[]>([]);

function todayKey() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function fmtMoney(n: number) {
  return Math.floor(n).toLocaleString();
}

async function loadOverview() {
  dashboard.value = await getAdminDashboard(date.value);
}

async function loadUsers() {
  users.value = await getAdminUsers(date.value);
}

async function loadAll() {
  loading.value = true;
  try {
    await Promise.all([loadOverview(), loadUsers()]);
  } finally {
    loading.value = false;
  }
}

function refresh() {
  void loadAll();
}

function viewUserOrders(user: AdminUserRow) {
  router.push({
    name: "admin-orders",
    query: {
      userId: user.id,
      userName: user.userName,
      date: date.value,
    },
  });
}

watch(date, () => {
  void loadAll();
});

onMounted(() => {
  void loadAll();
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

    <section class="admin-panel__overview">
      <h2 class="admin-panel__section-title">概览</h2>
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
    </section>

    <section class="admin-panel__users">
      <h2 class="admin-panel__section-title">用户详情</h2>
      <div v-if="!users.length && !loading" class="admin-user-detail__empty">暂无用户</div>
      <div v-else class="admin-users-list">
        <AdminUserDetail
          v-for="u in users"
          :key="u.id"
          :user="u"
          class="admin-users-list__item"
          @view-orders="viewUserOrders(u)"
        />
      </div>
    </section>
  </section>
</template>
