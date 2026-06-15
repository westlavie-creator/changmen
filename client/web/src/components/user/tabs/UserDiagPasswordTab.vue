<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { getClientData, saveClientData } from "@/api/esport";
import { generateTotp, totpSecondsLeft } from "@/shared/totp";

interface GoogleCodeRow {
  name: string;
  key: string;
}

const codes = ref<GoogleCodeRow[]>([{ name: "EB06", key: "msjsslro5dxxvb75o3rve5cgfe5d57u2" }]);
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

async function addGoogleCode() {
  try {
    const { value: name } = await ElMessageBox.prompt("名称", "添加谷歌验证码", {
      confirmButtonText: "下一步",
      cancelButtonText: "取消",
    });
    if (!name?.trim()) return;
    const { value: key } = await ElMessageBox.prompt("密钥", name.trim(), {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
    });
    if (!key?.trim()) return;
    codes.value.push({ name: name.trim(), key: key.trim() });
    await saveClientData("GoogleCode", JSON.stringify(codes.value));
    await refreshCodes();
    ElMessage.success("已添加");
  } catch {
    /* cancel */
  }
}
</script>

<template>
  <fieldset>
    <legend>修改密码</legend>
  </fieldset>
  <fieldset>
    <legend>
      谷歌验证码 {{ secondsLeft }}s
      <el-button link type="primary" class="am-icon-plus" @click="addGoogleCode" />
    </legend>
    <div class="flex googlecode">
      <div v-for="item in codes" :key="item.name" class="item">
        <div class="name">{{ item.name }}</div>
        <div class="code">{{ otpMap[item.name] ?? "------" }}</div>
      </div>
    </div>
  </fieldset>
</template>
