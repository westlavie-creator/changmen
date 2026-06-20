<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import AdminLayout from "@/components/admin/AdminLayout.vue";
import { useUserStore } from "@/stores/userStore";
import { getApiBase } from "@/config/apiBase";

const router = useRouter();
const user = useUserStore();

interface PoolStats { total: number; idle: number; waiting: number }
interface PlatformStat {
  active: number;
  totalConnections: number;
  lastConnectedAt: number;
  lastError: string;
  lastErrorAt: number;
}
interface HealthData {
  status: string;
  uptime: number;
  version: string;
  db: { connected: boolean; latencyMs: number; pool: PoolStats };
  memory: { rss: number; heapUsed: number; heapTotal: number };
  data: { users: number; accounts: number; clientMatches: number };
  wsForward: {
    enabled: boolean;
    platforms: string[];
    platformStats?: Record<string, PlatformStat>;
  };
}

const health = ref<HealthData | null>(null);
const error = ref("");
const loading = ref(false);
let timer: ReturnType<typeof setInterval> | null = null;

async function fetchHealth() {
  loading.value = true;
  try {
    const base = getApiBase();
    const res = await fetch(`${base}/health`, { headers: { Accept: "application/json" } });
    health.value = await res.json();
    error.value = "";
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

function uptimeStr(sec: number): string {
  if (sec >= 86400) return `${Math.floor(sec / 86400)}d ${Math.floor((sec % 86400) / 3600)}h`;
  if (sec >= 3600) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

function agoStr(ts: number): string {
  if (!ts) return "";
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec > 3600) return `${Math.floor(sec / 3600)}h ago`;
  if (sec > 60) return `${Math.floor(sec / 60)}m ago`;
  return `${sec}s ago`;
}

function heapPct(d: HealthData): number {
  return d.memory.heapTotal ? Math.round((d.memory.heapUsed / d.memory.heapTotal) * 100) : 0;
}

function poolActivePct(d: HealthData): number {
  const active = d.db.pool.total - d.db.pool.idle;
  return d.db.pool.total ? Math.round((active / d.db.pool.total) * 100) : 0;
}

onMounted(async () => {
  if (!user.ready) {
    try { await user.fetchUserInfo(); } catch {
      sessionStorage.setItem("gamebet:postLoginRedirect", "/admin/health");
      await router.replace({ name: "home" });
      return;
    }
  }
  if (!user.isAdmin) { await router.replace({ name: "home" }); return; }
  await fetchHealth();
  timer = setInterval(fetchHealth, 5000);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <AdminLayout title="系统健康" subtitle="服务状态、数据库、内存与 WebSocket 实时监控">
    <div v-if="error" class="health-error">
      <el-alert type="error" :closable="false" :title="error" />
    </div>
    <div v-if="health" class="health-grid">
      <!-- Status banner -->
      <div class="health-banner" :class="health.status === 'ok' ? 'health-banner--ok' : 'health-banner--bad'">
        <span class="health-dot" />
        <span class="health-banner-text">{{ health.status === 'ok' ? '系统正常' : '系统异常' }}</span>
        <span class="health-banner-meta">v{{ health.version }} · uptime {{ uptimeStr(health.uptime) }}</span>
      </div>

      <!-- Database -->
      <div class="health-card">
        <div class="health-card__title">数据库</div>
        <div class="health-row">
          <span>连接状态</span>
          <el-tag :type="health.db.connected ? 'success' : 'danger'" size="small" effect="dark">
            {{ health.db.connected ? '已连接' : '断开' }}
          </el-tag>
        </div>
        <div class="health-row">
          <span>查询延迟</span>
          <span class="health-val" :class="{ 'health-val--warn': health.db.latencyMs > 10, 'health-val--bad': health.db.latencyMs > 50 }">
            {{ health.db.latencyMs }}ms
          </span>
        </div>
        <div class="health-row">
          <span>连接池</span>
          <span class="health-val">{{ health.db.pool.total - health.db.pool.idle }} / {{ health.db.pool.total }} active</span>
        </div>
        <el-progress
          :percentage="poolActivePct(health)"
          :stroke-width="6"
          :show-text="false"
          :color="poolActivePct(health) > 80 ? '#f56c6c' : '#409eff'"
        />
        <div v-if="health.db.pool.waiting" class="health-row">
          <span>等待队列</span>
          <span class="health-val health-val--warn">{{ health.db.pool.waiting }}</span>
        </div>
      </div>

      <!-- Memory -->
      <div class="health-card">
        <div class="health-card__title">内存</div>
        <div class="health-row">
          <span>RSS</span>
          <span class="health-val">{{ health.memory.rss }} MB</span>
        </div>
        <div class="health-row">
          <span>Heap</span>
          <span class="health-val">{{ health.memory.heapUsed }} / {{ health.memory.heapTotal }} MB</span>
        </div>
        <el-progress
          :percentage="heapPct(health)"
          :stroke-width="6"
          :show-text="false"
          :color="heapPct(health) > 85 ? '#f56c6c' : heapPct(health) > 60 ? '#e6a23c' : '#67c23a'"
        />
      </div>

      <!-- Data -->
      <div class="health-card">
        <div class="health-card__title">数据缓存</div>
        <div class="health-row">
          <span>在线用户</span>
          <span class="health-val">{{ health.data.users }}</span>
        </div>
        <div class="health-row">
          <span>投注账号</span>
          <span class="health-val">{{ health.data.accounts }}</span>
        </div>
        <div class="health-row">
          <span>活跃比赛</span>
          <span class="health-val">{{ health.data.clientMatches }}</span>
        </div>
      </div>

      <!-- WebSocket Forward -->
      <div class="health-card health-card--wide">
        <div class="health-card__title">WebSocket 转发</div>
        <div class="health-row">
          <span>中继服务</span>
          <el-tag :type="health.wsForward.enabled ? 'success' : 'danger'" size="small" effect="dark">
            {{ health.wsForward.enabled ? '已启用' : '未启用' }}
          </el-tag>
        </div>
        <div
          v-for="pid in health.wsForward.platforms"
          :key="pid"
          class="health-platform"
        >
          <div class="health-row">
            <span class="health-platform-name">
              <span
                class="health-platform-dot"
                :class="{
                  'health-platform-dot--active': health.wsForward.platformStats?.[pid]?.active,
                  'health-platform-dot--error': health.wsForward.platformStats?.[pid]?.lastError && Date.now() - (health.wsForward.platformStats?.[pid]?.lastErrorAt ?? 0) < 600000,
                }"
              />
              {{ pid }}
            </span>
            <span v-if="health.wsForward.platformStats?.[pid]" class="health-val">
              {{ health.wsForward.platformStats[pid].active }} 连接
              <span class="health-sub">(累计 {{ health.wsForward.platformStats[pid].totalConnections }})</span>
            </span>
            <span v-else class="health-val health-sub">idle</span>
          </div>
          <div v-if="health.wsForward.platformStats?.[pid]?.lastConnectedAt" class="health-row health-row--sub">
            <span />
            <span class="health-sub">最近连接: {{ agoStr(health.wsForward.platformStats[pid].lastConnectedAt) }}</span>
          </div>
          <div
            v-if="health.wsForward.platformStats?.[pid]?.lastError && Date.now() - (health.wsForward.platformStats?.[pid]?.lastErrorAt ?? 0) < 600000"
            class="health-row health-row--sub"
          >
            <span />
            <span class="health-val--bad">{{ health.wsForward.platformStats[pid].lastError }}</span>
          </div>
        </div>
      </div>
    </div>
    <div v-else-if="loading" class="health-loading">加载中...</div>
  </AdminLayout>
</template>

<style scoped>
.health-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
}
.health-banner {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
}
.health-banner--ok { background: rgba(103, 194, 58, 0.1); color: #67c23a; }
.health-banner--bad { background: rgba(245, 108, 108, 0.1); color: #f56c6c; }
.health-dot {
  width: 10px; height: 10px; border-radius: 50%;
  background: currentColor;
  animation: pulse 2s infinite;
}
@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: .4 } }
.health-banner-meta { margin-left: auto; font-size: 13px; font-weight: 400; opacity: .7; }
.health-card {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 18px;
}
.health-card--wide { grid-column: 1 / -1; }
.health-card__title {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--el-text-color-secondary);
  margin-bottom: 12px;
  font-weight: 600;
}
.health-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 5px 0;
  font-size: 14px;
  color: var(--el-text-color-regular);
}
.health-row--sub { padding: 0 0 4px; }
.health-val { font-weight: 500; font-variant-numeric: tabular-nums; }
.health-val--warn { color: #e6a23c; }
.health-val--bad { color: #f56c6c; font-size: 12px; }
.health-sub { font-size: 12px; color: var(--el-text-color-secondary); }
.health-platform { border-top: 1px solid var(--el-border-color-extra-light); padding-top: 6px; margin-top: 6px; }
.health-platform:first-of-type { border-top: none; margin-top: 0; padding-top: 0; }
.health-platform-name { display: flex; align-items: center; gap: 8px; font-weight: 500; }
.health-platform-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--el-text-color-placeholder);
}
.health-platform-dot--active { background: #67c23a; }
.health-platform-dot--error { background: #f56c6c; }
.health-error { margin-bottom: 16px; }
.health-loading { text-align: center; padding: 40px; color: var(--el-text-color-secondary); }
</style>
