<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";

type RelayStatus = {
  platform: string;
  upstreamConnected: boolean;
  messagesReceived?: number;
  lastError?: string | null;
  lastUpstreamAt?: number | null;
  forwardedTopics?: number;
};

const isElectronRelay = Boolean(window.gamebetRelays);
const ray = ref<RelayStatus | null>(null);
const ob  = ref<RelayStatus | null>(null);
const tf  = ref<RelayStatus | null>(null);
const ia  = ref<RelayStatus | null>(null);
const loading = ref(false);
let timer: ReturnType<typeof setInterval> | null = null;

const visible  = computed(() => isElectronRelay);
const hasTf    = computed(() => Boolean(window.gamebetRelays?.tf));
const hasIa    = computed(() => Boolean(window.gamebetRelays?.ia));;

function dotClass(status: RelayStatus | null): string {
  return status?.upstreamConnected ? "is-on" : "is-off";
}

function stateText(status: RelayStatus | null): string {
  if (!status) return "未知";
  return status.upstreamConnected ? "已连接" : "未连接";
}

function formatTime(value?: number | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString("zh-CN", { hour12: false });
}

async function refreshStatus(): Promise<void> {
  if (!window.gamebetRelays) return;
  loading.value = true;
  try {
    const [rayStatus, obStatus, tfStatus, iaStatus] = await Promise.all([
      window.gamebetRelays.ray.status(),
      window.gamebetRelays.ob.status(),
      window.gamebetRelays.tf?.status() ?? Promise.resolve(null),
      window.gamebetRelays.ia?.status() ?? Promise.resolve(null),
    ]);
    ray.value = rayStatus;
    ob.value  = obStatus;
    tf.value  = tfStatus;
    ia.value  = iaStatus;
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  if (!isElectronRelay) return;
  void refreshStatus();
  timer = setInterval(() => {
    void refreshStatus();
  }, 5000);
});

onUnmounted(() => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
});
</script>

<template>
  <aside v-if="visible" class="electron-relay-status">
    <div class="relay-status-head">
      <span>Electron Relay</span>
      <button type="button" :disabled="loading" @click="refreshStatus">刷新</button>
    </div>

    <div class="relay-row">
      <div class="relay-main">
        <span class="relay-name">RAY</span>
        <span class="relay-state">
          <i :class="dotClass(ray)" />
          {{ stateText(ray) }}
        </span>
      </div>
      <div class="relay-meta">
        <span>消息 {{ ray?.messagesReceived ?? 0 }}</span>
        <span>最后 {{ formatTime(ray?.lastUpstreamAt) }}</span>
      </div>
      <div v-if="ray?.lastError" class="relay-error">{{ ray.lastError }}</div>
    </div>

    <div class="relay-row">
      <div class="relay-main">
        <span class="relay-name">OB</span>
        <span class="relay-state">
          <i :class="dotClass(ob)" />
          {{ stateText(ob) }}
        </span>
      </div>
      <div class="relay-meta">
        <span>Topic {{ ob?.forwardedTopics ?? 0 }}</span>
        <span>最后 {{ formatTime(ob?.lastUpstreamAt) }}</span>
      </div>
      <div v-if="ob?.lastError" class="relay-error">{{ ob.lastError }}</div>
    </div>

    <div v-if="hasTf" class="relay-row">
      <div class="relay-main">
        <span class="relay-name">TF</span>
        <span class="relay-state">
          <i :class="dotClass(tf)" />
          {{ stateText(tf) }}
        </span>
      </div>
      <div class="relay-meta">
        <span>消息 {{ tf?.messagesReceived ?? 0 }}</span>
        <span>最后 {{ formatTime(tf?.lastUpstreamAt) }}</span>
      </div>
      <div v-if="tf?.lastError" class="relay-error">{{ tf.lastError }}</div>
    </div>

    <div v-if="hasIa" class="relay-row">
      <div class="relay-main">
        <span class="relay-name">IA</span>
        <span class="relay-state">
          <i :class="dotClass(ia)" />
          {{ stateText(ia) }}
        </span>
      </div>
      <div class="relay-meta">
        <span>消息 {{ ia?.messagesReceived ?? 0 }}</span>
        <span>最后 {{ formatTime(ia?.lastUpstreamAt) }}</span>
      </div>
      <div v-if="ia?.lastError" class="relay-error">{{ ia.lastError }}</div>
    </div>
  </aside>
</template>

<style scoped>
.electron-relay-status {
  position: fixed;
  z-index: 3000;
  top: 10px;
  right: 10px;
  width: 230px;
  padding: 8px;
  border: 1px solid rgba(77, 96, 130, 0.32);
  border-radius: 4px;
  background: rgba(18, 24, 38, 0.9);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.22);
  color: #edf3ff;
  font-size: 12px;
  line-height: 1.35;
}

.relay-status-head,
.relay-main,
.relay-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.relay-status-head {
  margin-bottom: 6px;
  color: #f5f8ff;
  font-weight: 600;
}

.relay-status-head button {
  height: 22px;
  padding: 0 8px;
  border: 1px solid rgba(146, 166, 208, 0.4);
  border-radius: 3px;
  background: rgba(45, 61, 96, 0.9);
  color: #f5f8ff;
  cursor: pointer;
}

.relay-status-head button:disabled {
  cursor: default;
  opacity: 0.55;
}

.relay-row {
  padding: 6px 0;
  border-top: 1px solid rgba(139, 157, 194, 0.2);
}

.relay-name {
  font-weight: 700;
}

.relay-state {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #dce7ff;
}

.relay-state i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.relay-state .is-on {
  background: #28d17c;
  box-shadow: 0 0 8px rgba(40, 209, 124, 0.75);
}

.relay-state .is-off {
  background: #e15c5c;
}

.relay-meta {
  margin-top: 4px;
  color: #aab8d8;
}

.relay-error {
  margin-top: 4px;
  overflow: hidden;
  color: #ffb3b3;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
