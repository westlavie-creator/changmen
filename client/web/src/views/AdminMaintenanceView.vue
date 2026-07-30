<script setup lang="ts">
import type {
  AdminMaintenanceReport,
} from "@/types/admin";
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { getAdminMaintenance } from "@/api/admin";
import AdminLayout from "@/components/admin/AdminLayout.vue";
import PlatformIcon from "@/components/platform/PlatformIcon.vue";
import { useUserStore } from "@/stores/userStore";

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

const loading = ref(false);
const loadError = ref("");
const report = ref<AdminMaintenanceReport | null>(null);
const tab = ref<"venue" | "cross" | "same">("venue");

const sharedList = computed(() => report.value?.sharedVenueAccounts.list ?? []);
const crossList = computed(() => report.value?.duplicateOrderIds.crossUser ?? []);
const sameList = computed(() => report.value?.duplicateOrderIds.sameUser ?? []);

const summaryCards = computed(() => {
  const r = report.value;
  if (!r)
    return [];
  return [
    {
      tab: "venue" as const,
      label: "共用投注账号",
      value: r.sharedVenueAccounts.total,
      warn: r.sharedVenueAccounts.total > 0,
      hint: r.sharedVenueAccounts.bothActive > 0
        ? `${r.sharedVenueAccounts.bothActive} 组两边仍活跃`
        : (r.sharedVenueAccounts.total > 0 ? "含软删历史" : "无"),
    },
    {
      tab: "cross" as const,
      label: "跨用户 order_id",
      value: r.duplicateOrderIds.crossUserTotal,
      warn: r.duplicateOrderIds.crossUserTotal > 0,
      hint: pairHint(r.duplicateOrderIds.byPair),
    },
    {
      tab: "same" as const,
      label: "同用户 order_id",
      value: r.duplicateOrderIds.sameUserTotal,
      warn: r.duplicateOrderIds.sameUserTotal > 0,
      hint: "删号重加常见",
    },
  ];
});

function pairHint(byPair: Record<string, number>) {
  const entries = Object.entries(byPair || {}).sort((a, b) => b[1] - a[1]);
  if (!entries.length)
    return "无";
  return entries.slice(0, 3).map(([k, n]) => `${k}×${n}`).join("；");
}

function fmtTime(ms: number | null | undefined) {
  const n = Number(ms) || 0;
  if (!n)
    return "—";
  return new Date(n).toLocaleString("zh-CN", { hour12: false });
}

function fmtMoney(n: number) {
  return Math.floor(Number(n) || 0).toLocaleString();
}

async function load() {
  loadError.value = "";
  loading.value = true;
  try {
    report.value = await getAdminMaintenance();
  }
  catch (e) {
    report.value = null;
    loadError.value = (e as Error).message || "加载失败";
  }
  finally {
    loading.value = false;
  }
}

function goOrders(day?: string) {
  const query: Record<string, string> = {};
  if (day)
    query.date = day;
  void router.push({ name: "admin-orders", query });
}

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
  if (!userStore.isAdmin) {
    await router.replace({ name: "home" });
    return;
  }
  await load();
});
</script>

<template>
  <AdminLayout
    title="订单和用户维护"
    subtitle="诊断共用投注账号与 order_id 重复，并给出处理建议"
  >
    <section v-loading="loading" class="admin-card admin-maint">
      <div class="admin-card__toolbar">
        <el-button size="small" type="primary" :loading="loading" @click="load">
          重新扫描
        </el-button>
        <span v-if="report" class="admin-maint__meta">
          生成于 {{ fmtTime(report.generatedAt) }}
        </span>
      </div>

      <p v-if="loadError" class="admin-card__empty admin-card__empty--error">
        {{ loadError }}
      </p>

      <template v-else-if="report">
        <ul class="admin-maint__tips">
          <li v-for="(tip, i) in report.tips" :key="i">
            {{ tip }}
          </li>
        </ul>

        <div class="admin-maint__cards">
          <button
            v-for="card in summaryCards"
            :key="card.tab"
            type="button"
            class="admin-maint__card"
            :class="{ warn: card.warn }"
            @click="tab = card.tab"
          >
            <div class="admin-maint__card-label">
              {{ card.label }}
            </div>
            <div class="admin-maint__card-value">
              {{ card.value }}
            </div>
            <div class="admin-maint__card-hint">
              {{ card.hint }}
            </div>
          </button>
        </div>

        <el-tabs v-model="tab" class="admin-maint__tabs">
          <el-tab-pane
            :label="`共用投注账号（${sharedList.length}）`"
            name="venue"
          >
            <p v-if="!sharedList.length" class="admin-card__empty">
              未发现跨用户共用投注账号
            </p>
            <div
              v-for="g in sharedList"
              :key="g.venueAccountKey"
              class="admin-maint__block"
              :class="{ danger: g.bothActive }"
            >
              <header class="admin-maint__block-head">
                <div class="admin-maint__block-title">
                  <PlatformIcon :platform="g.provider" />
                  <strong>{{ g.provider }}</strong>
                  <span>{{ g.players[0]?.playerName || g.venueMemberId }}</span>
                  <el-tag v-if="g.bothActive" type="danger" size="small">
                    两边活跃
                  </el-tag>
                  <el-tag v-else type="info" size="small">
                    {{ g.activeUsers.length ? `现归 ${g.activeUsers.join("/")}` : "均已删" }}
                  </el-tag>
                </div>
                <div class="admin-maint__users">
                  涉及用户：{{ g.users.join("、") }}
                </div>
              </header>
              <p class="admin-maint__suggest">
                建议：{{ g.suggestion }}
              </p>
              <el-table :data="g.players" size="small" stripe>
                <el-table-column label="用户" width="100" prop="userName" />
                <el-table-column label="playerId" width="90" prop="playerId" />
                <el-table-column label="平台备注" min-width="120" prop="platformName" />
                <el-table-column label="账号名" min-width="120" prop="playerName" />
                <el-table-column label="状态" width="80">
                  <template #default="{ row }">
                    <el-tag :type="row.deleted ? 'info' : 'success'" size="small">
                      {{ row.deleted ? "已删" : "活跃" }}
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="订单数" width="80" prop="orderCount" />
                <el-table-column label="创建" width="160">
                  <template #default="{ row }">
                    {{ fmtTime(row.createdAt) }}
                  </template>
                </el-table-column>
                <el-table-column label="删除时间" width="160">
                  <template #default="{ row }">
                    {{ fmtTime(row.deletedAt) }}
                  </template>
                </el-table-column>
              </el-table>
              <div class="admin-maint__key">
                key: {{ g.venueAccountKey }}
              </div>
            </div>
          </el-tab-pane>

          <el-tab-pane
            :label="`跨用户 order_id（${crossList.length}）`"
            name="cross"
          >
            <p v-if="!crossList.length" class="admin-card__empty">
              未发现跨用户 order_id 重复
            </p>
            <div
              v-for="g in crossList"
              :key="`cross-${g.orderId}`"
              class="admin-maint__block"
            >
              <header class="admin-maint__block-head">
                <div class="admin-maint__block-title">
                  <strong>{{ g.day || "—" }}</strong>
                  <span class="admin-maint__oid">{{ g.orderId }}</span>
                  <el-tag type="warning" size="small">
                    {{ g.users.join(" + ") }}
                  </el-tag>
                </div>
                <el-button size="small" text type="primary" @click="goOrders(g.day)">
                  打开订单日
                </el-button>
              </header>
              <p class="admin-maint__suggest">
                建议：{{ g.suggestion }}
              </p>
              <el-table :data="g.rows" size="small" stripe>
                <el-table-column label="用户" width="100" prop="userName" />
                <el-table-column label="库 id" width="90" prop="id" />
                <el-table-column label="playerId" width="90" prop="playerId" />
                <el-table-column label="场馆" width="100" prop="provider" />
                <el-table-column label="状态" width="90" prop="status" />
                <el-table-column label="盈亏" width="90">
                  <template #default="{ row }">
                    <span :class="{ pos: row.money > 0, neg: row.money < 0 }">
                      {{ fmtMoney(row.money) }}
                    </span>
                  </template>
                </el-table-column>
              </el-table>
            </div>
          </el-tab-pane>

          <el-tab-pane
            :label="`同用户 order_id（${sameList.length}）`"
            name="same"
          >
            <p v-if="!sameList.length" class="admin-card__empty">
              未发现同用户 order_id 重复
            </p>
            <div
              v-for="g in sameList"
              :key="`same-${g.orderId}-${g.userIds[0]}`"
              class="admin-maint__block"
            >
              <header class="admin-maint__block-head">
                <div class="admin-maint__block-title">
                  <strong>{{ g.users[0] }}</strong>
                  <span>{{ g.day || "—" }}</span>
                  <span class="admin-maint__oid">{{ g.orderId }}</span>
                </div>
              </header>
              <p class="admin-maint__suggest">
                建议：{{ g.suggestion }}
              </p>
              <el-table :data="g.rows" size="small" stripe>
                <el-table-column label="库 id" width="90" prop="id" />
                <el-table-column label="playerId" width="90" prop="playerId" />
                <el-table-column label="场馆" width="100" prop="provider" />
                <el-table-column label="状态" width="90" prop="status" />
                <el-table-column label="盈亏" width="90">
                  <template #default="{ row }">
                    <span :class="{ pos: row.money > 0, neg: row.money < 0 }">
                      {{ fmtMoney(row.money) }}
                    </span>
                  </template>
                </el-table-column>
              </el-table>
            </div>
          </el-tab-pane>
        </el-tabs>
      </template>
    </section>
  </AdminLayout>
</template>

<style scoped>
.admin-maint__meta {
  margin-left: 12px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.admin-maint__tips {
  margin: 0 0 16px;
  padding: 12px 16px;
  list-style: disc;
  list-style-position: inside;
  background: color-mix(in srgb, var(--el-color-primary) 8%, transparent);
  border-radius: 8px;
  line-height: 1.6;
  font-size: 13px;
}

.admin-maint__cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.admin-maint__card {
  text-align: left;
  padding: 14px 16px;
  border: 1px solid var(--el-border-color);
  border-radius: 10px;
  background: var(--el-bg-color);
  cursor: pointer;
}

.admin-maint__card.warn {
  border-color: color-mix(in srgb, var(--el-color-danger) 50%, var(--el-border-color));
  background: color-mix(in srgb, var(--el-color-danger) 8%, var(--el-bg-color));
}

.admin-maint__card-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.admin-maint__card-value {
  margin-top: 4px;
  font-size: 28px;
  font-weight: 700;
  line-height: 1.2;
}

.admin-maint__card-hint {
  margin-top: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  word-break: break-all;
}

.admin-maint__block {
  margin-bottom: 16px;
  padding: 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 10px;
}

.admin-maint__block.danger {
  border-color: color-mix(in srgb, var(--el-color-danger) 55%, var(--el-border-color));
}

.admin-maint__block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.admin-maint__block-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.admin-maint__users {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.admin-maint__suggest {
  margin: 0 0 10px;
  padding: 8px 10px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--el-color-warning) 12%, transparent);
  font-size: 13px;
  line-height: 1.5;
}

.admin-maint__oid {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  word-break: break-all;
}

.admin-maint__key {
  margin-top: 8px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  word-break: break-all;
}

.pos {
  color: var(--el-color-success);
}

.neg {
  color: var(--el-color-danger);
}

@media (max-width: 900px) {
  .admin-maint__cards {
    grid-template-columns: 1fr;
  }
}
</style>
