<script setup lang="ts">
import { ElMessage } from "element-plus";
import { onMounted, onUnmounted, ref } from "vue";
import {
  clearLocalSportObSession,
  publicLocalSportObSession,
  saveLocalSportObSessionFromPaste,
} from "@/runtime/obSportSessionLocal";
import { clearObFootballClientCache } from "@/runtime/obSportFootballFetch";
import { notifySportObSessionUpdated, SPORT_OB_SESSION_UPDATED } from "@/runtime/sportObSessionEvents";
import { OB_SPORT_WS_ID, resolveObSportWsUrl } from "@/runtime/obSportWs";
import { getVenueWsStatus, subscribeVenueWsStatus } from "@changmen/venue-adapter/shared";

const emit = defineEmits<{
  saved: [];
}>();

const paste = ref("");
const saving = ref(false);
const configured = ref(false);
const summary = ref("");
const wsStatus = ref(getVenueWsStatus(OB_SPORT_WS_ID));
let unsubWs: (() => void) | undefined;

function wsLabel(status: string) {
  if (status === "connected")
    return "WS 已连接";
  if (status === "connecting")
    return "WS 连接中";
  if (status === "error")
    return "WS 断开";
  return "WS 未连";
}

async function refresh() {
  const info = publicLocalSportObSession();
  configured.value = Boolean(info.configured);
  if (info.configured) {
    const gw = info.gateway ? "有网关" : "无网关（粘贴未带 api.*，扩展无法代发）";
    const push = resolveObSportWsUrl(info) ? "有推送地址" : "无推送地址";
    summary.value = `${info.tokenMasked || "token"} · ${gw} · ${push} · ${wsLabel(wsStatus.value)}`;
  }
  else {
    summary.value = "未配置（足球页仍显示 PM/PF）";
  }
}

async function save() {
  const raw = paste.value.trim();
  if (!raw)
    return;
  saving.value = true;
  try {
    const info = saveLocalSportObSessionFromPaste(raw);
    clearObFootballClientCache();
    paste.value = "";
    if (info.gateway) {
      ElMessage.success("体育 OB 会话已保存，正在连接推送");
    }
    else {
      ElMessage.warning("token 已保存，但没有网关：扩展无法代发 HTTP。请从含 api 网关的插件数据再贴一次。");
    }
    notifySportObSessionUpdated();
    await refresh();
    emit("saved");
  }
  catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  }
  finally {
    saving.value = false;
  }
}

async function clearSession() {
  saving.value = true;
  try {
    clearLocalSportObSession();
    clearObFootballClientCache();
    ElMessage.success("已清除体育 OB 会话");
    notifySportObSessionUpdated();
    await refresh();
    emit("saved");
  }
  catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  }
  finally {
    saving.value = false;
  }
}

function onExternalUpdate() {
  void refresh();
  emit("saved");
}

onMounted(() => {
  void refresh();
  unsubWs = subscribeVenueWsStatus(() => {
    wsStatus.value = getVenueWsStatus(OB_SPORT_WS_ID);
    void refresh();
  });
  window.addEventListener(SPORT_OB_SESSION_UPDATED, onExternalUpdate);
});

onUnmounted(() => {
  unsubWs?.();
  window.removeEventListener(SPORT_OB_SESSION_UPDATED, onExternalUpdate);
});
</script>

<template>
  <div class="ob-sport-session">
    <span
      class="ob-sport-session__status"
      :class="{ on: configured, live: wsStatus === 'connected' }"
    >
      OB 体育采集 · {{ summary }}
    </span>
    <el-input
      v-model="paste"
      class="ob-sport-session__paste"
      type="textarea"
      :autosize="{ minRows: 2, maxRows: 5 }"
      size="small"
      placeholder="粘贴插件「数据」JSON / base64 / 进馆 URL（kind=sport）。本机保存，经扩展代发"
    />
    <el-button size="small" type="primary" :loading="saving" @click="save">
      保存
    </el-button>
    <el-button size="small" link :disabled="!configured || saving" @click="clearSession">
      清除
    </el-button>
  </div>
</template>

<style scoped>
.ob-sport-session {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 10px 8px;
  flex-wrap: wrap;
}
.ob-sport-session__status {
  font-size: 12px;
  color: #94a3b8;
  white-space: nowrap;
}
.ob-sport-session__status.on {
  color: #eab308;
}
.ob-sport-session__status.live {
  color: #67c23a;
}
.ob-sport-session__paste {
  flex: 1 1 280px;
  min-width: 180px;
  max-width: 520px;
}
</style>
