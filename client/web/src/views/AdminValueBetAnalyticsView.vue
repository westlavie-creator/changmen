<script setup lang="ts">
import type { ValueBetOrderAnalyticsPayload } from "@/api/admin";
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { getAdminValueBetAnalytics } from "@/api/admin";
import AdminLayout from "@/components/admin/AdminLayout.vue";
import AdminValueBetStatsSection from "@/components/admin/AdminValueBetStatsSection.vue";
import { todayKey } from "@/shared/dateKey";
import { useUserStore } from "@/stores/userStore";

const router = useRouter();
const user = useUserStore();

const rangeMode = ref<"day" | "month" | "all">("day");
const dateKey = ref(todayKey());
const monthKey = ref((() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
})());

const loading = ref(false);
const errorMsg = ref("");
const valueBet = ref<ValueBetOrderAnalyticsPayload | null>(null);

async function fetchData() {
  loading.value = true;
  errorMsg.value = "";
  try {
    const body: Record<string, unknown>
      = rangeMode.value === "all"
        ? { period: "all", all: "1" }
        : rangeMode.value === "month"
          ? { month: monthKey.value }
          : { date: dateKey.value };
    valueBet.value = await getAdminValueBetAnalytics(body);
  }
  catch (err) {
    valueBet.value = { byProvider: [], byOddsBucket: [] };
    errorMsg.value = err instanceof Error ? err.message : String(err);
  }
  finally {
    loading.value = false;
  }
}

onMounted(async () => {
  if (!user.ready) {
    try { await user.fetchUserInfo(); }
    catch {
      sessionStorage.setItem("gamebet:postLoginRedirect", "/admin/ev-analytics");
      await router.replace({ name: "home" });
      return;
    }
  }
  if (!user.canAccessAdmin) { await router.replace({ name: "home" }); return; }
  await fetchData();
});
</script>

<template>
  <AdminLayout title="正EV分析" subtitle="正 EV 下注按场馆与赔率区间统计">
    <div class="analytics-toolbar">
      <el-radio-group v-model="rangeMode" size="small" @change="fetchData">
        <el-radio-button value="day">
          按日
        </el-radio-button>
        <el-radio-button value="month">
          按月
        </el-radio-button>
        <el-radio-button value="all">
          全部
        </el-radio-button>
      </el-radio-group>
      <el-date-picker
        v-if="rangeMode === 'day'"
        v-model="dateKey"
        type="date"
        value-format="YYYY-MM-DD"
        size="small"
        style="width: 150px"
        @change="fetchData"
      />
      <el-date-picker
        v-if="rangeMode === 'month'"
        v-model="monthKey"
        type="month"
        value-format="YYYY-MM"
        size="small"
        style="width: 150px"
        @change="fetchData"
      />
      <el-button size="small" :loading="loading" @click="fetchData">
        刷新
      </el-button>
    </div>

    <el-alert
      v-if="errorMsg"
      type="error"
      :title="errorMsg"
      show-icon
      :closable="false"
      class="ev-alert"
    />

    <AdminValueBetStatsSection :data="valueBet" />
  </AdminLayout>
</template>

<style scoped>
.analytics-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.ev-alert {
  margin-bottom: 12px;
}
</style>
