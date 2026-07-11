<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import type { DirectRealtimeStatus } from "@venue/shared/directRealtimeStatus";
import { useDirectRealtimeStatus } from "@/composables/useDirectRealtimeStatus";
import {
  listVenueWsStatuses,
  subscribeVenueWsStatus,
  type VenueWsStatus,
  type VenueWsStatusEntry,
} from "@venue/shared/venueWsStatus";
import {
  getObMqttSourceMode,
  toggleObMqttSourceModeAndReconnect,
  type ObMqttSourceMode,
} from "@venue/ob";
import {
  cycleRayWsSourceModeAndReconnect,
  getRayWsSourceMode,
  rayWsSourceModeLabel,
  type RayWsSourceMode,
} from "@venue/ray";
import { ElMessage } from "element-plus";

const { statuses } = useDirectRealtimeStatus();

const venueWsStatuses = ref<VenueWsStatusEntry[]>(listVenueWsStatuses());
const obSourceMode = ref<ObMqttSourceMode>(getObMqttSourceMode());
const raySourceMode = ref<RayWsSourceMode>(getRayWsSourceMode());
let venueWsUnsub: (() => void) | undefined;

onMounted(() => {
  venueWsUnsub = subscribeVenueWsStatus(() => {
    venueWsStatuses.value = listVenueWsStatuses();
  });
});
onUnmounted(() => {
  venueWsUnsub?.();
});

function dotClass(status: DirectRealtimeStatus): string {
  if (status.upstreamConnected) {
    if (status.upstreamRoute === "a8")
      return "ok-a8";
    if (status.upstreamRoute === "changmen")
      return "ok-changmen";
    return "ok-official";
  }
  if (status.lastError)
    return "err";
  return "idle";
}

function venueWsDotClass(status: VenueWsStatus): string {
  switch (status) {
    case "connected": return "ok-official";
    case "connecting": return "connecting";
    case "error": return "err";
    default: return "idle";
  }
}

function formatAgo(ms: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (sec < 60)
    return `${sec}秒前`;
  const min = Math.floor(sec / 60);
  if (min < 60)
    return `${min}分钟前`;
  return `${Math.floor(min / 60)}小时前`;
}

function venueWsTooltip(entry: VenueWsStatusEntry): string {
  const names: Record<string, string> = {
    "pm-market": "Polymarket Market WS（赔率采集）",
    "pm-user": "Polymarket User WS（订单/拒单检测；登录后预连）",
    "lm-market": "Limitless Market WS（orderbook 推送）",
    "predictfun-market": "Predict.fun Market WS（orderbook 推送）",
    "dex": "DexSport WS",
    "cm-hub": "Changmen 实时 Hub（Socket.IO / pm_sport）",
  };
  const label = names[entry.id] ?? entry.label;
  switch (entry.status) {
    case "connected": return `${label}\n已连接 · 实时推送中`;
    case "connecting": return `${label}\n连接中...`;
    case "error": return `${label}\n断开 · 正在重连...`;
    default: return `${label}\n未连接`;
  }
}

function tooltip(status: DirectRealtimeStatus): string {
  const lines = [status.platform];
  if (status.upstreamConnected) {
    if (status.upstreamRoute === "a8")
      lines.push("已连接 A8 聚合");
    else if (status.upstreamRoute === "changmen")
      lines.push("已连接 CHANGMEN 转发");
    else lines.push("已连接官方上游");
  }
  else {
    lines.push("未连接上游");
  }
  if (status.lastError)
    lines.push(`错误：${status.lastError}`);
  if (status.messagesReceived)
    lines.push(`已收 ${status.messagesReceived} 条推送`);
  if (status.lastUpstreamAt)
    lines.push(`最近推送：${formatAgo(status.lastUpstreamAt)}`);
  if (status.forwardedTopics)
    lines.push(`MQTT 订阅 ${status.forwardedTopics} 个 topic`);
  if (status.platform === "OB") {
    lines.push(`当前选择：${obSourceMode.value === "a8" ? "A8 源" : "官方源"}`);
    lines.push("点击切换 A8 / 官方源");
  }
  if (status.platform === "RAY") {
    lines.push(`当前选择：${rayWsSourceModeLabel(raySourceMode.value)}`);
    lines.push("点击切换 官方 / CHANGMEN / A8");
  }
  return lines.join("\n");
}

function isClickablePlatform(platform: string): boolean {
  return platform === "OB" || platform === "RAY";
}

function itemClass(status: DirectRealtimeStatus): Record<string, boolean> {
  return {
    "direct-realtime-item--clickable": isClickablePlatform(status.platform),
  };
}

function handleStatusClick(status: DirectRealtimeStatus): void {
  if (status.platform === "OB") {
    obSourceMode.value = toggleObMqttSourceModeAndReconnect();
    ElMessage({
      message: `OB MQTT 已切换到${obSourceMode.value === "a8" ? "A8 源" : "官方源"}，正在重连`,
      type: "success",
      plain: true,
    });
    return;
  }
  if (status.platform === "RAY") {
    raySourceMode.value = cycleRayWsSourceModeAndReconnect();
    ElMessage({
      message: `RAY WS 已切换到${rayWsSourceModeLabel(raySourceMode.value)}，正在重连`,
      type: "success",
      plain: true,
    });
  }
}
</script>

<template>
  <div
    class="direct-realtime-bar"
    aria-label="直连推送状态 IA OB RAY TF PM-M PM-U LM PF DEX HUB"
  >
    <span
      v-for="status in statuses"
      :key="status.platform"
      class="direct-realtime-item"
      :class="itemClass(status)"
      :title="tooltip(status)"
      :role="isClickablePlatform(status.platform) ? 'button' : undefined"
      :tabindex="isClickablePlatform(status.platform) ? 0 : undefined"
      @click="handleStatusClick(status)"
      @keydown.enter.prevent="handleStatusClick(status)"
      @keydown.space.prevent="handleStatusClick(status)"
    >
      <span class="direct-realtime-dot" :class="dotClass(status)" />
      {{ status.platform }}
    </span>
    <span
      v-for="entry in venueWsStatuses"
      :key="entry.id"
      class="direct-realtime-item"
      :title="venueWsTooltip(entry)"
    >
      <span class="direct-realtime-dot" :class="venueWsDotClass(entry.status)" />
      {{ entry.label }}
    </span>
  </div>
</template>

<style scoped>
.direct-realtime-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 12px;
  max-width: min(96vw, 720px);
  padding: 6px 10px;
  border-radius: 6px;
  background: #00000080;
  border: 1px solid #ffffff1a;
  font-size: 15px;
  font-weight: 500;
  line-height: 1.2;
  color: #ffffffd9;
  user-select: none;
}

.direct-realtime-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: default;
  white-space: nowrap;
}

.direct-realtime-item:hover {
  color: #fff;
}

.direct-realtime-item--clickable {
  cursor: pointer;
}

.direct-realtime-item--clickable:hover .direct-realtime-dot {
  transform: scale(1.12);
}

.direct-realtime-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  flex-shrink: 0;
  transition: transform 0.15s ease;
}

.direct-realtime-dot.ok-official {
  background-color: #67c23a;
  box-shadow: 0 0 8px #67c23acc;
}

.direct-realtime-dot.ok-a8 {
  background-color: #409eff;
  box-shadow: 0 0 8px #409effcc;
}

.direct-realtime-dot.ok-changmen {
  background-color: #a855f7;
  box-shadow: 0 0 8px #a855f7cc;
}

.direct-realtime-dot.err {
  background-color: #f56c6c;
  box-shadow: 0 0 8px #f56c6ccc;
}

.direct-realtime-dot.idle {
  background-color: #ffffff66;
}

.direct-realtime-dot.connecting {
  background-color: #e6a23c;
  box-shadow: 0 0 8px #e6a23ccc;
  animation: ws-pulse 1.5s infinite;
}

@keyframes ws-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
