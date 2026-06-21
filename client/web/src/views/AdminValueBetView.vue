<script setup lang="ts">
import type { EdgeEntry, ValueBetDashboard } from "@/types/valueBet";
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import { getValueBetDashboard } from "@/api/valueBet";
import AdminLayout from "@/components/admin/AdminLayout.vue";
import { useUserStore } from "@/stores/userStore";

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
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
  finally {
    loading.value = false;
  }
}

const diag = computed(() => data.value?.diagnostics);
const cfg = computed(() => diag.value?.config);
const openCount = computed(() => data.value?.signals.length ?? 0);
const edgeDistTotal = computed(() => {
  if (!diag.value?.edgeDist)
    return 0;
  return Object.values(diag.value.edgeDist).reduce((s, n) => s + n, 0);
});

const edgeDistLabels: Record<string, string> = {
  "neg": "< 0%",
  "0-1": "0~1%",
  "1-2": "1~2%",
  "2-3": "2~3%",
  "3-5": "3~5% ✓",
  "5-10": "5~10% ✓",
  "10+": ">10% ✓",
};
const edgeDistOrder = ["neg", "0-1", "1-2", "2-3", "3-5", "5-10", "10+"];

function edgePct(e: number | string): string {
  return (Number(e) * 100).toFixed(2);
}

function edgeClass(e: number): string {
  if (e >= 0.05)
    return "vb-edge--hot";
  if (e >= 0.03)
    return "vb-edge--ok";
  if (e >= 0.01)
    return "vb-edge--near";
  return "";
}

function sideLabel(side: string): string {
  return side === "Home" ? "主" : "客";
}

function barWidth(count: number, total: number): string {
  if (!total)
    return "0%";
  return `${Math.max(2, Math.round(count / total * 100))}%`;
}

function isAboveThreshold(key: string): boolean {
  return key === "3-5" || key === "5-10" || key === "10+";
}

function timeAgo(ts: string): string {
  if (!ts)
    return "";
  const sec = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (sec > 3600)
    return `${Math.floor(sec / 3600)}h`;
  if (sec > 60)
    return `${Math.floor(sec / 60)}m`;
  return `${sec}s`;
}

function topEdgeRow(e: EdgeEntry) {
  const label = e.map > 0 ? `M${e.map} ${e.betName}` : e.betName;
  return { ...e, label };
}

function topEdgeRowClass({ row }: { row: EdgeEntry }) {
  return row.edge >= (cfg.value?.minEdge ?? 0.03) ? "vb-row--pass" : "";
}

onMounted(async () => {
  if (!user.ready) {
    try { await user.fetchUserInfo(); }
    catch {
      sessionStorage.setItem("gamebet:postLoginRedirect", "/admin/value-bet");
      await router.replace({ name: "home" });
      return;
    }
  }
  if (!user.canAccessAdmin) { await router.replace({ name: "home" }); return; }
  await fetchData();
  timer = setInterval(fetchData, 10000);
});

onUnmounted(() => {
  if (timer)
    clearInterval(timer);
});
</script>

<template>
  <AdminLayout title="价值投注" subtitle="正EV信号扫描 · PB基准线 · 实时诊断">
    <div v-if="error" class="vb-error">
      <el-alert type="error" :closable="false" :title="error" />
    </div>

    <div v-if="data" class="vb-grid">
      <!-- ═══ 引擎配置 ═══ -->
      <div v-if="cfg" class="vb-card">
        <div class="vb-card__title">
          引擎配置
        </div>
        <div class="vb-row">
          <span>基准线（Sharp）</span><span class="vb-val vb-val--accent">{{ cfg.sharpPlatform }}</span>
        </div>
        <div class="vb-row">
          <span>目标平台</span><span class="vb-val">{{ cfg.softPlatforms.join(', ') }}</span>
        </div>
        <div class="vb-row">
          <span>最小 Edge</span><span class="vb-val">{{ (cfg.minEdge * 100).toFixed(1) }}%</span>
        </div>
        <div class="vb-row">
          <span>Kelly 系数</span><span class="vb-val">{{ cfg.kellyMultiplier }}x</span>
        </div>
        <div class="vb-row">
          <span>赔率范围</span><span class="vb-val">{{ cfg.minOdds }} ~ {{ cfg.maxOdds }}</span>
        </div>
      </div>

      <!-- ═══ 扫描概况 ═══ -->
      <div v-if="diag" class="vb-card">
        <div class="vb-card__title">
          扫描概况
        </div>
        <div class="vb-row">
          <span>活跃比赛</span><span class="vb-val vb-val--big">{{ diag.matchCount }}</span>
        </div>
        <div class="vb-row">
          <span>总盘口</span><span class="vb-val vb-val--big">{{ diag.totalBets }}</span>
        </div>
        <div class="vb-row">
          <span>有 {{ cfg?.sharpPlatform }} 的盘口</span>
          <span class="vb-val" :class="diag.sharpPct > 20 ? 'vb-val--ok' : diag.sharpPct > 0 ? 'vb-val--warn' : 'vb-val--bad'">
            {{ diag.betsWithSharp }} ({{ diag.sharpPct }}%)
          </span>
        </div>
        <div class="vb-row">
          <span>Edge 计算样本</span>
          <span class="vb-val">{{ edgeDistTotal }} 条</span>
        </div>
        <div class="vb-row">
          <span>正EV信号（DB）</span>
          <span class="vb-val" :class="openCount > 0 ? 'vb-val--ok' : ''">{{ openCount }}</span>
        </div>
      </div>

      <!-- ═══ 平台覆盖率 ═══ -->
      <div v-if="diag && diag.platformCoverage.length" class="vb-card">
        <div class="vb-card__title">
          平台覆盖率
        </div>
        <div v-for="p in diag.platformCoverage" :key="p.platform" class="vb-coverage-row">
          <span class="vb-coverage-name" :class="{ 'vb-coverage-name--sharp': p.platform === cfg?.sharpPlatform }">
            {{ p.platform }}
          </span>
          <div class="vb-coverage-bar-wrap">
            <div class="vb-coverage-bar" :style="{ width: barWidth(p.count, diag.totalBets) }" :class="p.platform === cfg?.sharpPlatform ? 'vb-coverage-bar--sharp' : ''" />
          </div>
          <span class="vb-coverage-pct">{{ p.pct }}%</span>
          <span class="vb-coverage-count">{{ p.count }}</span>
        </div>
      </div>

      <!-- ═══ Edge 分布 ═══ -->
      <div v-if="diag && edgeDistTotal > 0" class="vb-card">
        <div class="vb-card__title">
          Edge 分布（PB vs 软盘）
        </div>
        <div v-for="key in edgeDistOrder" :key="key" class="vb-dist-row">
          <span class="vb-dist-label" :class="{ 'vb-dist-label--pass': isAboveThreshold(key) }">
            {{ edgeDistLabels[key] }}
          </span>
          <div class="vb-dist-bar-wrap">
            <div
              class="vb-dist-bar"
              :class="isAboveThreshold(key) ? 'vb-dist-bar--pass' : ''"
              :style="{ width: barWidth(diag.edgeDist[key] || 0, edgeDistTotal) }"
            />
          </div>
          <span class="vb-dist-count">{{ diag.edgeDist[key] || 0 }}</span>
        </div>
      </div>

      <!-- ═══ Top Edges（含低于阈值的） ═══ -->
      <div v-if="diag && diag.topEdges.length" class="vb-card vb-card--wide">
        <div class="vb-card__title">
          Top 赔率偏差（含未达阈值）
        </div>
        <el-table :data="diag.topEdges.map(topEdgeRow)" size="small" stripe :row-class-name="topEdgeRowClass">
          <el-table-column label="比赛" min-width="160">
            <template #default="{ row }">
              <div class="vb-match-cell">
                <span class="vb-match-title">{{ row.match }}</span>
                <span class="vb-match-sub">{{ row.game }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="盘口" min-width="100">
            <template #default="{ row }">
              {{ row.label }}
            </template>
          </el-table-column>
          <el-table-column prop="platform" label="软盘" width="65" align="center" />
          <el-table-column label="方向" width="55" align="center">
            <template #default="{ row }">
              <el-tag size="small" :type="row.side === 'Home' ? 'primary' : 'warning'" effect="plain">
                {{ sideLabel(row.side) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="软赔率" width="75" align="right">
            <template #default="{ row }">
              {{ row.softOdds.toFixed(3) }}
            </template>
          </el-table-column>
          <el-table-column label="公平赔率" width="75" align="right">
            <template #default="{ row }">
              {{ row.fairOdds.toFixed(3) }}
            </template>
          </el-table-column>
          <el-table-column label="Edge" width="80" align="right">
            <template #default="{ row }">
              <span :class="edgeClass(row.edge)" class="vb-edge">{{ edgePct(row.edge) }}%</span>
            </template>
          </el-table-column>
          <el-table-column label="PB线" width="110" align="center">
            <template #default="{ row }">
              <span class="vb-pb-line">{{ row.sharpHome.toFixed(3) }} / {{ row.sharpAway.toFixed(3) }}</span>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <!-- ═══ DB 信号（如果有） ═══ -->
      <div v-if="data.dbAvailable && data.signals.length" class="vb-card vb-card--wide">
        <div class="vb-card__title">
          持久化信号（value_signals 表）
        </div>
        <el-table :data="data.signals" size="small" stripe>
          <el-table-column label="比赛" min-width="160">
            <template #default="{ row }">
              <div class="vb-match-cell">
                <span class="vb-match-title">{{ row.match_title }}</span>
                <span class="vb-match-sub">{{ row.game }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="盘口" min-width="100">
            <template #default="{ row }">
              {{ row.map > 0 ? `M${row.map} ` : '' }}{{ row.bet_name }}
            </template>
          </el-table-column>
          <el-table-column prop="soft_platform" label="软盘" width="65" align="center" />
          <el-table-column label="方向" width="55" align="center">
            <template #default="{ row }">
              <el-tag size="small" :type="row.soft_side === 'Home' ? 'primary' : 'warning'" effect="plain">
                {{ sideLabel(row.soft_side) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="Edge" width="80" align="right">
            <template #default="{ row }">
              <span class="vb-edge vb-edge--hot">{{ edgePct(row.edge) }}%</span>
            </template>
          </el-table-column>
          <el-table-column label="Kelly" width="70" align="right">
            <template #default="{ row }">
              {{ (Number(row.kelly_frac) * 100).toFixed(2) }}%
            </template>
          </el-table-column>
          <el-table-column label="发现" width="55" align="center">
            <template #default="{ row }">
              <span class="vb-time">{{ timeAgo(row.created_at) }}</span>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <!-- ═══ 历史统计 ═══ -->
      <div v-if="data.dbAvailable && data.stats.length" class="vb-card">
        <div class="vb-card__title">
          信号历史
        </div>
        <div v-for="s in data.stats" :key="s.status" class="vb-row">
          <el-tag size="small" effect="dark" :type="s.status === 'open' ? 'success' : s.status === 'expired' ? 'info' : 'primary'">
            {{ s.status }}
          </el-tag>
          <span class="vb-val">{{ s.count }} 条 <span class="vb-sub">avg {{ edgePct(s.avg_edge) }}%</span></span>
        </div>
      </div>
    </div>

    <div v-else-if="loading" class="vb-loading">
      加载中...
    </div>
  </AdminLayout>
</template>

<style scoped>
.vb-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
}
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
.vb-val--big { font-size: 18px; font-weight: 700; }
.vb-val--accent { color: #409eff; }
.vb-val--ok { color: #67c23a; }
.vb-val--warn { color: #e6a23c; }
.vb-val--bad { color: #f56c6c; }
.vb-sub { font-size: 12px; color: var(--el-text-color-secondary); margin-left: 8px; }

/* Coverage bars */
.vb-coverage-row {
  display: flex; align-items: center; gap: 8px;
  padding: 3px 0; font-size: 13px;
}
.vb-coverage-name { width: 42px; font-weight: 500; }
.vb-coverage-name--sharp { color: #409eff; }
.vb-coverage-bar-wrap { flex: 1; height: 14px; background: var(--el-fill-color-light); border-radius: 3px; overflow: hidden; }
.vb-coverage-bar { height: 100%; background: var(--el-color-primary-light-5); border-radius: 3px; transition: width .3s; min-width: 2px; }
.vb-coverage-bar--sharp { background: #409eff; }
.vb-coverage-pct { width: 42px; text-align: right; font-variant-numeric: tabular-nums; color: var(--el-text-color-secondary); font-size: 12px; }
.vb-coverage-count { width: 28px; text-align: right; font-variant-numeric: tabular-nums; font-size: 12px; color: var(--el-text-color-secondary); }

/* Edge distribution bars */
.vb-dist-row {
  display: flex; align-items: center; gap: 8px;
  padding: 3px 0; font-size: 13px;
}
.vb-dist-label { width: 62px; font-variant-numeric: tabular-nums; color: var(--el-text-color-secondary); }
.vb-dist-label--pass { color: #67c23a; font-weight: 600; }
.vb-dist-bar-wrap { flex: 1; height: 14px; background: var(--el-fill-color-light); border-radius: 3px; overflow: hidden; }
.vb-dist-bar { height: 100%; background: var(--el-color-primary-light-7); border-radius: 3px; transition: width .3s; }
.vb-dist-bar--pass { background: #67c23a; }
.vb-dist-count { width: 32px; text-align: right; font-variant-numeric: tabular-nums; font-size: 12px; }

/* Table */
.vb-match-cell { display: flex; flex-direction: column; gap: 2px; }
.vb-match-title { font-weight: 500; font-size: 13px; }
.vb-match-sub { font-size: 11px; color: var(--el-text-color-secondary); }
.vb-edge { font-weight: 600; font-variant-numeric: tabular-nums; }
.vb-edge--hot { color: #67c23a; }
.vb-edge--ok { color: #409eff; }
.vb-edge--near { color: #e6a23c; }
.vb-pb-line { font-size: 12px; font-variant-numeric: tabular-nums; color: var(--el-text-color-secondary); }
.vb-time { font-size: 12px; color: var(--el-text-color-secondary); }

:deep(.vb-row--pass) { background: rgba(103, 194, 58, 0.06) !important; }

.vb-error { margin-bottom: 16px; }
.vb-loading { text-align: center; padding: 40px; color: var(--el-text-color-secondary); }
</style>
