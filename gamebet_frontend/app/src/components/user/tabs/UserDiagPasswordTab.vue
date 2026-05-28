<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { getClientData } from "@/api/esport";
import { generateTotp, totpSecondsLeft } from "@/shared/totp";

interface GoogleCodeRow {
  name: string;
  key: string;
}

const codes = ref<GoogleCodeRow[]>([
  { name: "EB06", key: "msjsslro5dxxvb75o3rve5cgfe5d57u2" },
]);
const otpMap = ref<Record<string, string>>({});
const secondsLeft = ref(30);
let timer: ReturnType<typeof setInterval> | null = null;

async function refreshCodes() {
  const next: Record<string, string> = {};
  for (const item of codes.value) {
    next[item.name] = await generateTotp(item.key);
  }
  otpMap.value = next;
  secondsLeft.value = totpSecondsLeft();
}

onMounted(async () => {
  const saved = (await getClientData("GoogleCode")) as GoogleCodeRow[] | null;
  if (Array.isArray(saved) && saved.length) {
    codes.value = saved;
  }
  await refreshCodes();
  timer = setInterval(() => void refreshCodes(), 1000);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <div class="diag-tab">
    <fieldset class="diag-fieldset">
      <legend>修改密码</legend>
      <p class="diag-tab__muted">密码修改请通过管理员或 A8 后台完成。</p>
    </fieldset>
    <fieldset class="diag-fieldset">
      <legend>谷歌验证码 <span class="otp-timer">{{ secondsLeft }}s</span></legend>
      <div class="google-code">
        <div v-for="item in codes" :key="item.name" class="google-code__item">
          <div class="google-code__name">{{ item.name }}</div>
          <div class="google-code__code">{{ otpMap[item.name] ?? "------" }}</div>
        </div>
      </div>
    </fieldset>
  </div>
</template>

<style scoped>
.diag-fieldset {
  border: 1px solid #334155;
  border-radius: 4px;
  padding: 10px 12px;
  margin: 0 0 12px;
  color: #e2e8f0;
}
.diag-fieldset legend {
  padding: 0 6px;
  font-size: 13px;
}
.diag-tab__muted {
  margin: 0;
  font-size: 12px;
  color: #64748b;
}
.otp-timer {
  font-size: 11px;
  color: #94a3b8;
  margin-left: 6px;
}
.google-code {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.google-code__item {
  display: flex;
  gap: 16px;
  align-items: center;
}
.google-code__name {
  min-width: 48px;
  color: #94a3b8;
  font-size: 13px;
}
.google-code__code {
  font-size: 22px;
  letter-spacing: 0.2em;
  color: #93c5fd;
  font-weight: 600;
}
</style>
