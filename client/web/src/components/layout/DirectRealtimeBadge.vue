<script setup lang="ts">
import type { DirectRealtimeStatus } from "@platform/shared/directRealtimeStatus";
import { useDirectRealtimeStatus } from "@/composables/useDirectRealtimeStatus";

const { statuses } = useDirectRealtimeStatus();

function dotClass(status: DirectRealtimeStatus): string {
  if (status.upstreamConnected) return "ok";
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
  lines.push(status.upstreamConnected ? "已连接上游" : "未连接上游");
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
    </span>
  </div>
</template>

<style scoped>
.direct-realtime-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 8px;
  border-radius: 6px;
  background: #00000080;
  border: 1px solid #ffffff1a;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.2;
  color: #ffffffd9;
  user-select: none;
}

.direct-realtime-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: default;
  white-space: nowrap;
}

.direct-realtime-item:hover {
  color: #fff;
}

.direct-realtime-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.direct-realtime-dot.ok {
  background-color: #67c23a;
  box-shadow: 0 0 6px #67c23acc;
}

.direct-realtime-dot.err {
  background-color: #f56c6c;
  box-shadow: 0 0 6px #f56c6ccc;
}

.direct-realtime-dot.idle {
  background-color: #ffffff66;
}
</style>
