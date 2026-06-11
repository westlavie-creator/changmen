<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessageBox } from "element-plus";
import { useUserStore } from "@/stores/userStore";
import { probeGamebetExtension } from "@/extension/bridge";
import { gamebetExtensionInstallHint } from "@/config/gamebetExtension";

const router = useRouter();
const route = useRoute();
const user = useUserStore();

const form = reactive({
  userName: "",
  password: "",
});

const loading = ref(false);
const error = ref("");
const extensionStatus = ref<"checking" | "installed" | "missing">("checking");
const extensionVersion = ref("");

onMounted(async () => {
  const info = await probeGamebetExtension();
  if (info) {
    extensionStatus.value = "installed";
    extensionVersion.value = info.version ?? "";
  } else {
    extensionStatus.value = "missing";
  }
});

async function promptInstallExtension() {
  await ElMessageBox.alert(gamebetExtensionInstallHint(), "请先安装 Chrome 插件", {
    type: "warning",
    confirmButtonText: "知道了",
  });
}

async function submit() {
  if (!form.userName.trim() || !form.password || loading.value) return;

  if (extensionStatus.value === "checking") {
    const info = await probeGamebetExtension();
    extensionStatus.value = info ? "installed" : "missing";
    if (info?.version) extensionVersion.value = info.version;
  }

  if (extensionStatus.value !== "installed") {
    error.value = "请先安装并启用 Gamebet Chrome 插件后再登录。";
    await promptInstallExtension();
    return;
  }

  loading.value = true;
  error.value = "";
  try {
    await user.login(form.password, form.userName.trim());
    const redirect = typeof route.query.redirect === "string" ? route.query.redirect : "/";
    await router.replace(redirect);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="container flex flex-middle flex-column">
    <div class="slogo" />
    <div class="loginbox">
      <el-alert
        v-if="extensionStatus === 'checking'"
        type="info"
        :closable="false"
        show-icon
        title="正在检测 Chrome 插件…"
        class="login-extension-alert"
      />
      <el-alert
        v-else-if="extensionStatus === 'missing'"
        type="warning"
        :closable="false"
        show-icon
        title="未检测到 Gamebet Chrome 插件"
        description="PB / Stake 采集与跨域代发依赖插件。请先安装插件后再登录。"
        class="login-extension-alert"
      />
      <el-alert
        v-else
        type="success"
        :closable="false"
        show-icon
        :title="extensionVersion ? `插件已就绪（v${extensionVersion}）` : '插件已就绪'"
        class="login-extension-alert"
      />
      <el-form :model="form" @submit.prevent="submit">
        <el-form-item>
          <el-input
            v-model="form.userName"
            size="large"
            placeholder="用户名"
            autocomplete="username"
          />
        </el-form-item>
        <el-form-item>
          <el-input
            v-model="form.password"
            type="password"
            show-password
            size="large"
            placeholder="密码"
            autocomplete="current-password"
          />
        </el-form-item>
        <p v-if="error" class="login-error">{{ error }}</p>
        <el-form-item>
          <el-button
            size="large"
            type="primary"
            style="width: 100%"
            :disabled="!form.userName || !form.password || loading || extensionStatus === 'checking'"
            @click="submit"
          >
            {{ loading ? "登录中…" : extensionStatus === "checking" ? "检测插件中…" : "登录" }}
          </el-button>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<style scoped>
.login-extension-alert {
  margin-bottom: 16px;
}
</style>
