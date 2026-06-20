<script setup lang="ts">
import type { DirectRealtimeStatus } from "@platform/shared/directRealtimeStatus";
import { useDirectRealtimeStatus } from "@/composables/useDirectRealtimeStatus";
import {
  getObMqttMode,
  isObGlobalConnected,
  switchObMqttMode,
} from "@platform/ob/mqttModeSwitch";

const { statuses } = useDirectRealtimeStatus();
const obMqttMode = getObMqttMode();

function toggleObMode() {
  void switchObMqttMode(obMqttMode.value === "a8" ? "official" : "a8");
}

function obModeTooltip(): string {
  if (obMqttMode.value === "official") {
    return `OB MQTT: 官网模式（全局 /market/odds/update）\n${isObGlobalConnected() ? "已连接" : "连接中..."}\n点击切换回 A8 模式`;
  }
  return "OB MQTT: A8 模式（按场订阅）\n点击切换到官网模式（全局推送）";
}

function dotClass(status: DirectRealtimeStatus): string {
  if (status.upstreamConnected) {
    if (status.upstreamRoute === "a8") return "ok-a8";
    if (status.upstreamRoute === "changmen") return "ok-changmen";
    return "ok-official";
  }
  if (status.lastError) return "err";
  return "idle";
}

function formatAgo(ms: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (sec < 60) return `${sec}秒前`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}分钟前`;
  return `${Math.floor(min / 60)}小时前`;
}

function tooltip(status: DirectRealtimeStatus): string {
  const lines = [status.platform];
  if (status.upstreamConnected) {
    if (status.upstreamRoute === "a8") lines.push("已连接 A8 聚合");
    else if (status.upstreamRoute === "changmen") lines.push("已连接 CHANGMEN 转发");
    else lines.push("已连接官方上游");
  } else {
    lines.push("未连接上游");
  }
  if (status.lastError) lines.push(`错误：${status.lastError}`);
  if (status.messagesReceived) lines.push(`已收 ${status.messagesReceived} 条推送`);
  if (status.lastUpstreamAt) lines.push(`最近推送：${formatAgo(status.lastUpstreamAt)}`);
  if (status.forwardedTopics) lines.push(`MQTT 订阅 ${status.forwardedTopics} 个 topic`);
  return lines.join("\n");
}
</script>

<template>
  <div class="direct-realtime-bar" aria-label="直连推送状态 IA OB RAY TF">
    <span
      v-for="status in statuses"
      :key="status.platform"
      class="direct-realtime-item"
      :title="tooltip(status)"
    >
      <span class="direct-realtime-dot" :class="dotClass(status)" />
      {{ status.platform }}
      <span
        v-if="status.platform === 'OB'"
        class="ob-mode-dot"
        :class="obMqttMode === 'official' ? 'ob-mode-official' : 'ob-mode-a8'"
        :title="obModeTooltip()"
        @click.stop="toggleObMode"
      />
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

.direct-realtime-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  flex-shrink: 0;
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

.ob-mode-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  cursor: pointer;
  margin-left: -4px;
  transition: background-color 0.3s;
}

.ob-mode-dot:hover {
  transform: scale(1.3);
}

.ob-mode-a8 {
  background-color: #ffffff44;
  border: 1px solid #ffffff66;
}

.ob-mode-official {
  background-color: #f59e0b;
  box-shadow: 0 0 6px #f59e0bcc;
}
</style>
