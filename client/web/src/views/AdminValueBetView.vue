<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed } from "vue";
import { useRouter } from "vue-router";
import AdminLayout from "@/components/admin/AdminLayout.vue";
import { useUserStore } from "@/stores/userStore";
import { getValueBetDashboard } from "@/api/valueBet";
import type { ValueBetDashboard, ValueSignalRow } from "@/types/valueBet";

const router = useRouter();
const user = useUserStore();

const data = ref<ValueBetDashboard | null>(null);
const error = ref("");
const loading = ref(false);
let timer: ReturnType<typeof setInterval> | null = null;

async function fetchData() {
  loading.value = true;
  try {
    data.value = await getValueBetDashboard();
    error.value = "";
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

const openCount = computed(() => data.value?.signals.length ?? 0);

const totalHistoryCount = computed(() =>
  (data.value?.stats ?? []).reduce((sum, s) => sum + s.count, 0),
);

function edgePct(row: ValueSignalRow): string {
  return (Number(row.edge) * 100).toFixed(2);
}

function kellyPct(row: ValueSignalRow): string {
  return (Number(row.kelly_frac) * 100).toFixed(2);
}

function pbLine(row: ValueSignalRow): string {
  return `${Number(row.sharp_home_odds).toFixed(3)} / ${Number(row.sharp_away_odds).toFixed(3)}`;
}

function edgeClass(row: ValueSignalRow): string {
  const e = Number(row.edge);
  if (e >= 0.05) return "vb-edge--hot";
  return "";
}

function sideLabel(side: string): string {
  return side === "Home" ? "主" : "客";
}

function timeAgo(ts: string): string {
  if (!ts) return "";
  const sec = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (sec > 3600) return `${Math.floor(sec / 3600)}h`;
  if (sec > 60) return `${Math.floor(sec / 60)}m`;
  return `${sec}s`;
}

onMounted(async () => {
  if (!user.ready) {
    try {
      await user.fetchUserInfo();
    } catch {
      sessionStorage.setItem("gamebet:postLoginRedirect", "/admin/value-bet");
      await router.replace({ name: "home" });
      return;
    }
  }
  if (!user.isAdmin) {
    await router.replace({ name: "home" });
    return;
  }
  await fetchData();
  timer = setInterval(fetchData, 10000);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <AdminLayout title="价值投注" subtitle="正EV信号扫描 · PB基准线 · 实时监控">
    <div v-if="error" class="vb-error">
      <el-alert type="error" :closable="false" :title="error" />
    </div>

    <div v-if="data" class="vb-grid">
      <!-- Status banner -->
      <div
        class="vb-banner"
        :class="data.available ? (openCount > 0 ? 'vb-banner--hot' : 'vb-banner--ok') : 'vb-banner--off'"
      >
        <span class="vb-dot" />
        <span class="vb-banner-text">
          <template v-if="!data.available">引擎未就绪（value_signals 表未创建或 DB 不可用）</template>
          <template v-else-if="openCount > 0">发现 {{ openCount }} 个正EV信号</template>
          <template v-else>引擎运行中，当前无正EV信号</template>
        </span>
        <span class="vb-banner-meta">
          累计 {{ totalHistoryCount }} 条信号
        </span>
      </div>

      <!-- Signals table -->
      <div v-if="data.available && data.signals.length" class="vb-card vb-card--wide">
        <div class="vb-card__title">实时信号</div>
        <el-table :data="data.signals" size="small" stripe>
          <el-table-column label="比赛" min-width="180">
            <template #default="{ row }">
              <div class="vb-match-cell">
                <span class="vb-match-title">{{ row.match_title }}</span>
                <span class="vb-match-sub">{{ row.game }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="盘口" min-width="120">
            <template #default="{ row }">
              {{ row.map > 0 ? `M${row.map} ` : '' }}{{ row.bet_name }}
            </template>
          </el-table-column>
          <el-table-column prop="soft_platform" label="软盘" width="70" align="center" />
          <el-table-column label="方向" width="60" align="center">
            <template #default="{ row }">
              <el-tag size="small" :type="row.soft_side === 'Home' ? 'primary' : 'warning'" effect="plain">
                {{ sideLabel(row.soft_side) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="软赔率" width="80" align="right">
            <template #default="{ row }">{{ Number(row.soft_odds).toFixed(3) }}</template>
          </el-table-column>
          <el-table-column label="公平赔率" width="80" align="right">
            <template #default="{ row }">{{ Number(row.fair_odds).toFixed(3) }}</template>
          </el-table-column>
          <el-table-column label="Edge" width="80" align="right" sortable sort-by="edge">
            <template #default="{ row }">
              <span :class="edgeClass(row)" class="vb-edge">{{ edgePct(row) }}%</span>
            </template>
          </el-table-column>
          <el-table-column label="Kelly" width="75" align="right">
            <template #default="{ row }">{{ kellyPct(row) }}%</template>
          </el-table-column>
          <el-table-column label="PB线" width="120" align="center">
            <template #default="{ row }">
              <span class="vb-pb-line">{{ pbLine(row) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="发现" width="60" align="center">
            <template #default="{ row }">
              <span class="vb-time">{{ timeAgo(row.created_at) }}</span>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <!-- Stats + Platform dist -->
      <div v-if="data.available" class="vb-card">
        <div class="vb-card__title">历史统计</div>
        <div v-if="data.stats.length === 0" class="vb-empty">暂无数据</div>
        <div v-for="s in data.stats" :key="s.status" class="vb-row">
          <span>
            <el-tag
              size="small"
              effect="dark"
              :type="s.status === 'open' ? 'success' : s.status === 'expired' ? 'info' : 'primary'"
            >{{ s.status }}</el-tag>
          </span>
          <span class="vb-val">
            {{ s.count }} 条
            <span class="vb-sub">avg {{ (Number(s.avg_edge) * 100).toFixed(2) }}%</span>
            <span class="vb-sub">max {{ (Number(s.max_edge) * 100).toFixed(2) }}%</span>
          </span>
        </div>
      </div>

      <div v-if="data.available" class="vb-card">
        <div class="vb-card__title">平台分布</div>
        <div v-if="data.platformDist.length === 0" class="vb-empty">暂无数据</div>
        <div v-for="p in data.platformDist" :key="p.soft_platform" class="vb-row">
          <span class="vb-platform-name">{{ p.soft_platform }}</span>
          <span class="vb-val">
            {{ p.count }} 条
            <span class="vb-sub">avg {{ (Number(p.avg_edge) * 100).toFixed(2) }}%</span>
          </span>
        </div>
      </div>
    </div>

    <div v-else-if="loading" class="vb-loading">加载中...</div>
  </AdminLayout>
</template>

<style scoped>
.vb-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
}
.vb-banner {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
}
.vb-banner--ok { background: rgba(103, 194, 58, 0.1); color: #67c23a; }
.vb-banner--hot { background: rgba(64, 158, 255, 0.12); color: #409eff; }
.vb-banner--off { background: rgba(144, 147, 153, 0.1); color: #909399; }
.vb-dot {
  width: 10px; height: 10px; border-radius: 50%;
  background: currentColor;
  animation: vb-pulse 2s infinite;
}
@keyframes vb-pulse { 0%,100% { opacity: 1 } 50% { opacity: .4 } }
.vb-banner-meta { margin-left: auto; font-size: 13px; font-weight: 400; opacity: .7; }
.vb-card {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 18px;
}
.vb-card--wide { grid-column: 1 / -1; }
.vb-card__title {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--el-text-color-secondary);
  margin-bottom: 12px;
  font-weight: 600;
}
.vb-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 5px 0;
  font-size: 14px;
  color: var(--el-text-color-regular);
}
.vb-val { font-weight: 500; font-variant-numeric: tabular-nums; }
.vb-sub { font-size: 12px; color: var(--el-text-color-secondary); margin-left: 8px; }
.vb-platform-name { font-weight: 500; }
.vb-match-cell { display: flex; flex-direction: column; gap: 2px; }
.vb-match-title { font-weight: 500; font-size: 13px; }
.vb-match-sub { font-size: 11px; color: var(--el-text-color-secondary); }
.vb-edge { font-weight: 600; font-variant-numeric: tabular-nums; }
.vb-edge--hot { color: #67c23a; }
.vb-pb-line { font-size: 12px; font-variant-numeric: tabular-nums; color: var(--el-text-color-secondary); }
.vb-time { font-size: 12px; color: var(--el-text-color-secondary); }
.vb-empty { text-align: center; padding: 16px; color: var(--el-text-color-secondary); font-size: 13px; }
.vb-error { margin-bottom: 16px; }
.vb-loading { text-align: center; padding: 40px; color: var(--el-text-color-secondary); }
</style>
