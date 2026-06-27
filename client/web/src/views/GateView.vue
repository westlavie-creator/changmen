<script setup lang="ts">
import { computed, defineAsyncComponent } from "vue";
import { useRouter } from "vue-router";
import { getToken } from "@/api/client";
import LoginPanel from "@/components/auth/LoginPanel.vue";
import KakashiRaikiriLoader from "@/components/layout/KakashiRaikiriLoader.vue";
import PluginIntroShell from "@/components/layout/PluginIntroShell.vue";
import { useExtensionGate } from "@/composables/useExtensionGate";
import { useUserStore } from "@/stores/userStore";

const HomeView = defineAsyncComponent(() => import("@/views/HomeView.vue"));

const router = useRouter();
const user = useUserStore();
const { extensionReady } = useExtensionGate();
const sessionReady = computed(() => user.ready);
const sessionChecked = computed(() => user.sessionChecked);
const showLoginGate = computed(() => sessionChecked.value && extensionReady.value);
/** restoreSession 进行中（有 token 且尚未判定完成）时显示雷切加载动画 */
const showSessionRestore = computed(
  () => Boolean(getToken()) && !sessionReady.value && !sessionChecked.value,
);

async function onLoginSuccess() {
  const redirect = sessionStorage.getItem("gamebet:postLoginRedirect");
  sessionStorage.removeItem("gamebet:postLoginRedirect");
  if (redirect && redirect !== "/" && redirect.startsWith("/")) {
    await router.replace(redirect);
  }
}
</script>

<template>
  <KeepAlive v-if="sessionReady">
    <HomeView />
  </KeepAlive>
  <KakashiRaikiriLoader v-else-if="showSessionRestore" />
  <PluginIntroShell v-else-if="showLoginGate" :show-login="true">
    <LoginPanel @success="onLoginSuccess" />
  </PluginIntroShell>
  <PluginIntroShell v-else :show-login="false" />
</template>
