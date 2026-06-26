<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import type { DirectRealtimeStatus } from "@venue/shared/directRealtimeStatus";
import { useDirectRealtimeStatus } from "@/composables/useDirectRealtimeStatus";
import { getDexSocketStatus, onDexSocketStatus } from "@venue/dex";
import type { DexSocketStatus } from "@venue/dex";
import { getPolymarketWsStatus, onPolymarketWsStatus } from "@venue/polymarket";
import type { PolymarketWsStatus } from "@venue/polymarket";
import {
  getObMqttSourceMode,
  toggleObMqttSourceModeAndReconnect,
  type ObMqttSourceMode,
} from "@venue/ob";
import { ElMessage } from "element-plus";

const { statuses } = useDirectRealtimeStatus();

const dexStatus = ref<DexSocketStatus>(getDexSocketStatus());
const polymarketStatus = ref<PolymarketWsStatus>(getPolymarketWsStatus());
const obSourceMode = ref<ObMqttSourceMode>(getObMqttSourceMode());
let dexUnsub: (() => void) | undefined;
let polymarketUnsub: (() => void) | undefined;
onUnmounted(() => {
  dexUnsub?.();
  polymarketUnsub?.();
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

function formatAgo(ms: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (sec < 60)
    return `${sec}秒前`;
  const min = Math.floor(sec / 60);
  if (min < 60)
    return `${min}分钟前`;
  return `${Math.floor(min / 60)}小时前`;
}

const dexDotClass = ref("idle");
const dexTooltip = ref("DexSport WS 未连接");
const polymarketDotClass = ref("idle");
const polymarketTooltip = ref("Polymarket WS 未连接");

function realtimeDotAndTooltip(
  s: DexSocketStatus | PolymarketWsStatus,
  label: string,
): { dot: string; tooltip: string } {
  switch (s) {
    case "connected": return { dot: "ok-official", tooltip: `${label} WS 已连接\n实时赔率推送中` };
    case "connecting": return { dot: "connecting", tooltip: `${label} WS 连接中...` };
    case "error": return { dot: "err", tooltip: `${label} WS 断开\n正在重连...` };
    default: return { dot: "idle", tooltip: `${label} WS 未连接` };
  }
}

function updateDexDot(s: DexSocketStatus) {
  const next = realtimeDotAndTooltip(s, "DexSport");
  dexDotClass.value = next.dot;
  dexTooltip.value = next.tooltip;
}

function updatePolymarketDot(s: PolymarketWsStatus) {
  const next = realtimeDotAndTooltip(s, "Polymarket");
  polymarketDotClass.value = next.dot;
  polymarketTooltip.value = next.tooltip;
}
updateDexDot(dexStatus.value);
updatePolymarketDot(polymarketStatus.value);
onMounted(() => {
  dexUnsub = onDexSocketStatus(s => { dexStatus.value = s; updateDexDot(s); });
  polymarketUnsub = onPolymarketWsStatus((s) => {
    polymarketStatus.value = s;
    updatePolymarketDot(s);
  });
});

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
  return lines.join("\n");
}

function itemClass(status: DirectRealtimeStatus): Record<string, boolean> {
  return {
    "direct-realtime-item--clickable": status.platform === "OB",
  };
}

function handleStatusClick(status: DirectRealtimeStatus): void {
  if (status.platform !== "OB") return;
  obSourceMode.value = toggleObMqttSourceModeAndReconnect();
  ElMessage({
    message: `OB MQTT 已切换到${obSourceMode.value === "a8" ? "A8 源" : "官方源"}，正在重连`,
    type: "success",
    plain: true,
  });
}
</script>

<template>
  <div class="direct-realtime-bar" aria-label="直连推送状态 IA OB RAY TF POLY DEX">
    <span
      v-for="status in statuses"
      :key="status.platform"
      class="direct-realtime-item"
      :class="itemClass(status)"
      :title="tooltip(status)"
      :role="status.platform === 'OB' ? 'button' : undefined"
      :tabindex="status.platform === 'OB' ? 0 : undefined"
      @click="handleStatusClick(status)"
      @keydown.enter.prevent="handleStatusClick(status)"
      @keydown.space.prevent="handleStatusClick(status)"
    >
      <span class="direct-realtime-dot" :class="dotClass(status)" />
      {{ status.platform }}
    </span>
    <span class="direct-realtime-item" :title="polymarketTooltip">
      <span class="direct-realtime-dot" :class="polymarketDotClass" />
      POLY
    </span>
    <span class="direct-realtime-item" :title="dexTooltip">
      <span class="direct-realtime-dot" :class="dexDotClass" />
      DEX
    </span>
  </div>
</template>

<style scoped>
.direct-realtime-bar {
  display: flex;
  align-items: center;
  gap: 12px;
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
  animation: dex-pulse 1.5s infinite;
}

@keyframes dex-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
