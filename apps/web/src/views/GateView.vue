<script setup lang="ts">
import { computed, defineAsyncComponent } from "vue";
import { useRouter } from "vue-router";
import LoginPanel from "@/components/auth/LoginPanel.vue";
import PluginIntroShell from "@/components/layout/PluginIntroShell.vue";
import { useExtensionGate } from "@/composables/useExtensionGate";
import {
  expectedGamebetExtensionId,
  gamebetExtensionInstallHint,
} from "@/config/gamebetExtension";
import { useUserStore } from "@/stores/userStore";

const HomeView = defineAsyncComponent(() => import("@/views/HomeView.vue"));

const router = useRouter();
const user = useUserStore();
const { extensionReady, domExtensionId } = useExtensionGate();
const extensionHint = gamebetExtensionInstallHint();
const expectedExtensionId = expectedGamebetExtensionId();
const sessionReady = computed(() => user.ready);
const showLogin = computed(() => user.sessionChecked);

async function onLoginSuccess() {
  const redirect = sessionStorage.getItem("gamebet:postLoginRedirect");
  sessionStorage.removeItem("gamebet:postLoginRedirect");
  if (redirect && redirect !== "/" && redirect.startsWith("/")) {
    await router.replace(redirect);
  }
}
</script>

<template>
  <div v-if="!sessionReady && !showLogin" class="session-restoring" aria-busy="true" />
  <PluginIntroShell v-else-if="!sessionReady" :show-login="true">
    <p v-if="!extensionReady" class="extension-hint">{{ extensionHint }}</p>
    <p v-if="!extensionReady && domExtensionId" class="extension-hint extension-hint--id">
      页面检测到扩展 ID：<code>{{ domExtensionId }}</code>
      <span v-if="domExtensionId !== expectedExtensionId">（与期望 {{ expectedExtensionId }} 不一致）</span>
    </p>
    <LoginPanel @success="onLoginSuccess" />
  </PluginIntroShell>
  <HomeView v-else />
</template>

<style scoped>
.session-restoring {
  width: 100%;
  height: 100%;
  min-height: 100%;
}
</style>
