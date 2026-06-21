<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AdminLayout from "@/components/admin/AdminLayout.vue";
import MonthReportTable from "@/components/report/MonthReportTable.vue";
import { getAdminMonthReport, getAdminUsers } from "@/api/admin";
import type { AdminUserRow } from "@/types/admin";
import type { MonthReportPayload } from "@/types/monthReport";
import { useUserStore } from "@/stores/userStore";

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

const month = ref(new Date().toISOString().slice(0, 7));
const filterUserId = ref(String(route.query.userId || ""));
const users = ref<AdminUserRow[]>([]);
const loading = ref(false);
const report = ref<MonthReportPayload | null>(null);
const loadError = ref("");

const filterUserName = computed(() => {
  const fromQuery = String(route.query.userName || "");
  if (fromQuery) return fromQuery;
  return users.value.find((u) => u.id === filterUserId.value)?.userName || "";
});

const pageTitle = computed(() =>
  filterUserId.value
    ? `${filterUserName.value || "用户"} · 月报表`
    : userStore.isAdmin ? "全站月报表" : "团队月报表",
);

const pageSubtitle = computed(() =>
  filterUserId.value
    ? "按用户筛选：盈利、流水、充提与被黑"
    : "按月汇总：盈利、流水、充提与被黑",
);

async function loadUsers() {
  try {
    users.value = await getAdminUsers();
  } catch {
    users.value = [];
  }
}

async function load() {
  loadError.value = "";
  loading.value = true;
  try {
    report.value = await getAdminMonthReport(
      month.value,
      filterUserId.value || undefined,
    );
  } catch (e) {
    report.value = null;
    loadError.value = (e as Error).message || "加载失败";
  } finally {
    loading.value = false;
  }
}

function syncRouteQuery() {
  const q: Record<string, string> = {};
  if (filterUserId.value) {
    q.userId = filterUserId.value;
    if (filterUserName.value) q.userName = filterUserName.value;
  }
  void router.replace({ name: "admin-reports", query: q });
}

watch(month, () => {
  void load();
});

watch(filterUserId, () => {
  syncRouteQuery();
  void load();
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
  if (!userStore.canAccessAdmin) {
    await router.replace({ name: "home" });
    return;
  }
  await loadUsers();
  await load();
});
</script>

<template>
  <AdminLayout :title="pageTitle" :subtitle="pageSubtitle">
    <section class="admin-card admin-card--report">
      <div class="admin-card__toolbar">
        <div class="admin-card__toolbar-left">
          <span class="admin-card__toolbar-label">统计月份</span>
          <el-date-picker
            v-model="month"
            type="month"
            placeholder="Pick a month"
            value-format="YYYY-MM"
            size="small"
            style="width: 150px"
          />
          <el-select
            v-model="filterUserId"
            clearable
            filterable
            placeholder="全部"
            size="small"
            style="width: 180px"
          >
            <el-option
              v-for="u in users"
              :key="u.id"
              :label="u.userName"
              :value="u.id"
            />
          </el-select>
        </div>
        <div class="admin-card__toolbar-right">
          <el-button size="small" type="primary" @click="load">查询</el-button>
          <el-button size="small" @click="load">刷新</el-button>
        </div>
      </div>
      <div class="admin-card__body">
        <p v-if="loadError" class="admin-card__empty admin-card__empty--error">{{ loadError }}</p>
        <MonthReportTable
          v-else
          variant="admin"
          :list="report?.list ?? []"
          :total="report?.total ?? null"
          :loading="loading"
        />
      </div>
    </section>
  </AdminLayout>
</template>
