<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import AdminLayout from "@/components/admin/AdminLayout.vue";
import {
  getAdminMarketHubRoute,
  saveAdminMarketHubRoute,
} from "@/api/admin";
import { authHeaders } from "@/api/client";
import { getApiBase } from "@/config/apiBase";
import { useUserStore } from "@/stores/userStore";

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
interface EsportActionStat {
  action: string;
  count: number;
  avgMs: number;
  maxMs: number;
  lastMs: number;
  lastAt: number;
}
interface EsportSlowRow {
  action: string;
  durationMs: number;
  at: number;
}
interface EsportApiHealth {
  counter: number;
  lastDelayMs: number;
  lastAction: string;
  lastAt: number;
  slowRecent: EsportSlowRow[];
  byAction: EsportActionStat[];
}
interface PmMarketHubClient {
  id: number;
  userId?: string;
  userName?: string;
  assetCount: number;
  connectedForSec: number;
  idleSubscribeSec: number | null;
  lastBufferedAmount: number;
  droppedToClient: number;
  coalescedToClient?: number;
  softSkipToClient?: number;
  hardSkipToClient?: number;
  pendingAssets?: number;
  pendingAgeMs?: number;
  sentToClient: number;
  remoteAddress: string;
  xForwardedFor?: string;
  userAgent: string;
}
interface PmMarketHubStatus {
  activeClients: number;
  subscribedAssets: number;
  upstreamConnected: boolean;
  pendingFlushMs?: number;
  softBufferedBytes?: number;
  thinFrames?: boolean;
  softSkipTotal?: number;
  hardSkipTotal?: number;
  pendingMaxAgeMs?: number;
  slowClients: PmMarketHubClient[];
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
    hubs?: {
      pmMarket?: PmMarketHubStatus;
      pmMarketSecondary?: PmMarketHubStatus | null;
    } | null;
  };
  esportApi?: EsportApiHealth;
}

const health = ref<HealthData | null>(null);
const error = ref("");
const loading = ref(false);
let timer: ReturnType<typeof setInterval> | null = null;

const pmHubSites = computed(() => {
  const hubs = health.value?.wsForward.hubs;
  return [
    { id: "202", label: "202 / ws", hub: hubs?.pmMarket ?? null },
    { id: "166", label: "166 / ws2", hub: hubs?.pmMarketSecondary ?? null },
  ];
});

const pmHubClientRows = computed(() => {
  return pmHubSites.value.flatMap((site) =>
    (site.hub?.slowClients ?? []).map(row => ({
      ...row,
      siteId: site.id,
      siteLabel: site.label,
    })),
  );
});

function isFullHealthData(v: unknown): v is HealthData {
  if (!v || typeof v !== "object")
    return false;
  const o = v as Partial<HealthData>;
  return typeof o.uptime === "number"
    && o.db != null
    && o.memory != null
    && o.data != null
    && o.wsForward != null;
}

async function fetchHealth() {
  loading.value = true;
  try {
    const base = getApiBase();
    const res = await fetch(`${base}/health`, {
      headers: { Accept: "application/json", ...authHeaders() },
    });
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      throw new Error(`后端返回非 JSON（${res.status}），请确认 /health 代理已配置`);
    }
    const payload: unknown = await res.json();
    if (!isFullHealthData(payload)) {
      throw new Error("健康检查数据不完整：请确认已用管理员或团队长账号登录，且后端已部署 /health 鉴权");
    }
    health.value = payload;
    error.value = "";
  }
  catch (e) {
    health.value = null;
    error.value = e instanceof Error ? e.message : String(e);
  }
  finally {
    loading.value = false;
  }
}

function uptimeStr(sec: number): string {
  if (sec >= 86400)
    return `${Math.floor(sec / 86400)}d ${Math.floor((sec % 86400) / 3600)}h`;
  if (sec >= 3600)
    return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

function agoStr(ts: number): string {
  if (!ts)
    return "";
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec > 3600)
    return `${Math.floor(sec / 3600)}h ago`;
  if (sec > 60)
    return `${Math.floor(sec / 60)}m ago`;
  return `${sec}s ago`;
}

function heapPct(d: HealthData): number {
  return d.memory.heapTotal ? Math.round((d.memory.heapUsed / d.memory.heapTotal) * 100) : 0;
}

function poolActivePct(d: HealthData): number {
  const active = d.db.pool.total - d.db.pool.idle;
  return d.db.pool.total ? Math.round((active / d.db.pool.total) * 100) : 0;
}

const routeLoading = ref(false);
const routeSaving = ref(false);
const routeLoaded = ref(false);
const routeError = ref("");
const routeUsersText = ref("");
const routePrimaryOrigin = ref("https://ws.changmen.fun");
const routeSecondaryOrigin = ref("https://ws2.changmen.fun");
const routeUpdatedAt = ref<number | null>(null);

const HUB_ORIGIN_OPTIONS = [
  { label: "ws（202）", value: "https://ws.changmen.fun" },
  { label: "ws2（166）", value: "https://ws2.changmen.fun" },
];

async function loadMarketHubRoute() {
  routeError.value = "";
  routeLoaded.value = false;
  routeLoading.value = true;
  try {
    const cfg = await getAdminMarketHubRoute();
    routeUsersText.value = (cfg.primaryUsers || []).join("\n");
    routePrimaryOrigin.value = cfg.primaryOrigin;
    routeSecondaryOrigin.value = cfg.secondaryOrigin;
    routeUpdatedAt.value = cfg.updatedAt ?? null;
    routeLoaded.value = true;
  }
  catch (e) {
    routeError.value = (e as Error).message || "加载分流配置失败";
  }
  finally {
    routeLoading.value = false;
  }
}

async function saveMarketHubRoute() {
  if (routeSaving.value || !routeLoaded.value || !user.isAdmin)
    return;
  routeSaving.value = true;
  routeError.value = "";
  try {
    const cfg = await saveAdminMarketHubRoute({
      primaryUsers: routeUsersText.value,
      primaryOrigin: routePrimaryOrigin.value,
      secondaryOrigin: routeSecondaryOrigin.value,
      defaultHub: "secondary",
    });
    routeUsersText.value = (cfg.primaryUsers || []).join("\n");
    routePrimaryOrigin.value = cfg.primaryOrigin;
    routeSecondaryOrigin.value = cfg.secondaryOrigin;
    routeUpdatedAt.value = cfg.updatedAt ?? null;
    ElMessage.success("已保存。已在线用户需刷新后换线");
  }
  catch (e) {
    routeError.value = (e as Error).message || "保存失败";
    ElMessage.error(routeError.value);
  }
  finally {
    routeSaving.value = false;
  }
}

function delayColor(ms: number): string {
  if (ms < 100)
    return "health-val--ok";
  if (ms < 500)
    return "health-val--warn";
  return "health-val--bad";
}

onMounted(async () => {
  if (!user.ready) {
    try { await user.fetchUserInfo(); }
    catch {
      sessionStorage.setItem("gamebet:postLoginRedirect", "/admin/health");
      await router.replace({ name: "home" });
      return;
    }
  }
  if (!user.canAccessAdmin) { await router.replace({ name: "home" }); return; }
  await Promise.all([
    fetchHealth(),
    user.isAdmin ? loadMarketHubRoute() : Promise.resolve(),
  ]);
  timer = setInterval(fetchHealth, 5000);
});

onUnmounted(() => {
  if (timer)
    clearInterval(timer);
});
</script>

<template>
  <AdminLayout title="系统健康" subtitle="服务状态、数据库、内存与 WebSocket 实时监控">
    <div v-if="error" class="health-error">
      <el-alert type="error" :closable="false" :title="error" />
    </div>
    <div
      v-if="user.isAdmin"
      class="health-card health-card--wide health-route"
    >
      <div class="health-card__title">
        Market hub 分流
      </div>
      <p class="health-sub">
        名单走 primary（默认 202 / ws），其他人走 secondary（默认 166 / ws2）。保存后已在线用户需刷新。
      </p>
      <el-alert
        v-if="routeError"
        type="error"
        :closable="false"
        :title="routeError"
        class="health-error"
      />
      <div class="health-route__row">
        <label class="health-route__label">走 202 的用户</label>
        <el-input
          v-model="routeUsersText"
          type="textarea"
          :rows="5"
          placeholder="每行一个登录名，如 gb11"
          :disabled="!routeLoaded || routeLoading || routeSaving"
        />
      </div>
      <div class="health-route__row health-route__origins">
        <div>
          <label class="health-route__label">primary</label>
          <el-select v-model="routePrimaryOrigin" :disabled="!routeLoaded || routeLoading || routeSaving">
            <el-option
              v-for="opt in HUB_ORIGIN_OPTIONS"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </div>
        <div>
          <label class="health-route__label">secondary</label>
          <el-select v-model="routeSecondaryOrigin" :disabled="!routeLoaded || routeLoading || routeSaving">
            <el-option
              v-for="opt in HUB_ORIGIN_OPTIONS"
              :key="`s-${opt.value}`"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </div>
      </div>
      <div class="health-row">
        <span class="health-sub">
          {{ routeUpdatedAt ? `上次保存 ${new Date(routeUpdatedAt).toLocaleString("zh-CN", { hour12: false })}` : "尚未落盘，当前为默认/环境变量" }}
        </span>
        <el-button
          type="primary"
          size="small"
          :loading="routeSaving"
          :disabled="!routeLoaded || routeLoading"
          @click="saveMarketHubRoute"
        >
          保存
        </el-button>
      </div>
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
        <div class="health-card__title">
          数据库
        </div>
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
        <div class="health-card__title">
          内存
        </div>
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
        <div class="health-card__title">
          数据缓存
        </div>
        <div class="health-row">
          <span>在线用户</span>
          <span class="health-val">{{ health.data.users }}</span>
        </div>
        <div class="health-row">
          <span>操盘账号</span>
          <span class="health-val">{{ health.data.accounts }}</span>
        </div>
        <div class="health-row">
          <span>活跃比赛</span>
          <span class="health-val">{{ health.data.clientMatches }}</span>
        </div>
      </div>

      <!-- Esport API timing -->
      <div v-if="health.esportApi" class="health-card health-card--wide">
        <div class="health-card__title">
          Esport API 延迟（服务端）
        </div>
        <div class="health-row">
          <span>最近请求</span>
          <span class="health-val" :class="delayColor(health.esportApi.lastDelayMs)">
            {{ health.esportApi.lastDelayMs }}ms
            <span class="health-sub"> · {{ health.esportApi.lastAction || "—" }}</span>
          </span>
        </div>
        <div class="health-row">
          <span>累计 POST</span>
          <span class="health-val">{{ health.esportApi.counter }}</span>
        </div>
        <div v-if="health.esportApi.lastAt" class="health-row health-row--sub">
          <span />
          <span class="health-sub">最近完成: {{ agoStr(health.esportApi.lastAt) }}</span>
        </div>
        <div v-if="health.esportApi.byAction.length" class="health-api-table-wrap">
          <table class="health-api-table">
            <thead>
              <tr>
                <th>Action</th>
                <th>次数</th>
                <th>均耗</th>
                <th>最大</th>
                <th>最近</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in health.esportApi.byAction" :key="row.action">
                <td>{{ row.action }}</td>
                <td>{{ row.count }}</td>
                <td>{{ row.avgMs }}ms</td>
                <td :class="delayColor(row.maxMs)">
                  {{ row.maxMs }}ms
                </td>
                <td>{{ row.lastMs }}ms</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="health.esportApi.slowRecent.length" class="health-slow-list">
          <div class="health-sub">
            慢请求（≥500ms）
          </div>
          <div
            v-for="(row, idx) in health.esportApi.slowRecent"
            :key="`${row.action}-${row.at}-${idx}`"
            class="health-row health-row--sub"
          >
            <span class="health-sub">{{ row.action }}</span>
            <span class="health-val" :class="delayColor(row.durationMs)">
              {{ row.durationMs }}ms · {{ agoStr(row.at) }}
            </span>
          </div>
        </div>
      </div>

      <!-- WebSocket Forward -->
      <div class="health-card health-card--wide">
        <div class="health-card__title">
          WebSocket 转发
        </div>
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

      <!-- PM-MARKET Hub 连接监测（202 + 166） -->
      <div
        v-if="health.wsForward.hubs?.pmMarket || health.wsForward.hubs?.pmMarketSecondary !== undefined"
        class="health-card health-card--wide"
      >
        <div class="health-card__title">
          PM-MARKET Hub
        </div>
        <div
          v-for="site in pmHubSites"
          :key="site.id"
          class="health-platform"
        >
          <div class="health-row">
            <span>{{ site.label }}</span>
            <template v-if="site.hub">
              <el-tag
                :type="site.hub.upstreamConnected ? 'success' : 'info'"
                size="small"
                effect="dark"
              >
                {{ site.hub.upstreamConnected ? '上游已连' : '上游未连' }}
              </el-tag>
            </template>
            <el-tag v-else type="info" size="small">
              不可达
            </el-tag>
          </div>
          <div v-if="site.hub" class="health-row health-row--sub">
            <span />
            <span class="health-val">
              {{ site.hub.activeClients }} 连接
              <span class="health-sub">
                · 订阅 {{ site.hub.subscribedAssets }} assets
                · soft-skip {{ site.hub.softSkipTotal ?? 0 }}
                · hard-skip {{ site.hub.hardSkipTotal ?? 0 }}
              </span>
            </span>
          </div>
        </div>
        <div
          v-if="pmHubClientRows.length"
          class="health-api-table-wrap"
        >
          <table class="health-api-table">
            <thead>
              <tr>
                <th>节点</th>
                <th>用户</th>
                <th>IP</th>
                <th>assets</th>
                <th>drop</th>
                <th>soft</th>
                <th>coalesced</th>
                <th>pending</th>
                <th>age</th>
                <th>buf</th>
                <th>时长</th>
                <th>UA</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in pmHubClientRows"
                :key="`${row.siteId}-${row.id}`"
              >
                <td>{{ row.siteLabel }}</td>
                <td :title="row.userId || undefined">
                  {{ row.userName || row.userId || '未鉴权' }}
                </td>
                <td>{{ row.remoteAddress || '—' }}</td>
                <td>{{ row.assetCount }}</td>
                <td :class="{ 'health-val--bad': row.droppedToClient > 0 }">
                  {{ row.droppedToClient }}
                </td>
                <td :class="{ 'health-val--warn': (row.softSkipToClient ?? 0) > 0 }">
                  {{ row.softSkipToClient ?? 0 }}
                </td>
                <td>{{ row.coalescedToClient ?? 0 }}</td>
                <td :class="{ 'health-val--warn': (row.pendingAssets ?? 0) > 0 }">
                  {{ row.pendingAssets ?? 0 }}
                </td>
                <td :class="{ 'health-val--warn': (row.pendingAgeMs ?? 0) > 500 }">
                  {{ row.pendingAgeMs ?? 0 }}ms
                </td>
                <td>{{ row.lastBufferedAmount }}</td>
                <td>{{ row.connectedForSec }}s</td>
                <td class="health-sub">
                  {{ row.userAgent || '—' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div
          v-else
          class="health-row health-row--sub"
        >
          <span class="health-sub">暂无客户端连接</span>
        </div>
      </div>
    </div>
    <div v-else-if="loading" class="health-loading">
      加载中...
    </div>
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
.health-route { margin-bottom: 16px; }
.health-route__row { margin: 10px 0; }
.health-route__label {
  display: block;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 6px;
}
.health-route__origins { display: flex; gap: 16px; flex-wrap: wrap; }
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
.health-val--ok { color: #67c23a; }
.health-val--warn { color: #e6a23c; }
.health-val--bad { color: #f56c6c; }
.health-api-table-wrap { margin-top: 10px; overflow-x: auto; }
.health-api-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.health-api-table th,
.health-api-table td {
  padding: 4px 8px;
  text-align: left;
  border-bottom: 1px solid var(--el-border-color-extra-light);
}
.health-api-table th {
  color: var(--el-text-color-secondary);
  font-weight: 600;
}
.health-slow-list { margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--el-border-color-extra-light); }
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
