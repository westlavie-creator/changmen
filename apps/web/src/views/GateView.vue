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

async function onLoginSuccess() {
  const redirect = sessionStorage.getItem("gamebet:postLoginRedirect");
  sessionStorage.removeItem("gamebet:postLoginRedirect");
  if (redirect && redirect !== "/" && redirect.startsWith("/")) {
    await router.replace(redirect);
  }
}
</script>

<template>
  <PluginIntroShell v-if="!sessionReady" :show-login="true">
    <p v-if="!extensionReady" class="extension-hint">{{ extensionHint }}</p>
    <p v-if="!extensionReady && domExtensionId" class="extension-hint extension-hint--id">
      页面检测到扩展 ID：<code>{{ domExtensionId }}</code>
      <span v-if="domExtensionId !== expectedExtensionId">（与期望 {{ expectedExtensionId }} 不一致）</span>
    </p>
    <LoginPanel @success="onLoginSuccess" />
  </PluginIntroShell>
  <HomeView v-else />
</template>
