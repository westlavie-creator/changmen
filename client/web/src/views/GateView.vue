<script setup lang="ts">
import { computed, defineAsyncComponent } from "vue";
import { useRouter } from "vue-router";
import LoginPanel from "@/components/auth/LoginPanel.vue";
import CopyShellBanner from "@/components/layout/CopyShellBanner.vue";
import PluginIntroShell from "@/components/layout/PluginIntroShell.vue";
import { showDevSkinBanner } from "@/lib/copyShell";
import { useExtensionGate } from "@/composables/useExtensionGate";
import { useUserStore } from "@/stores/userStore";

const HomeView = defineAsyncComponent(() => import("@/views/HomeView.vue"));

const router = useRouter();
const user = useUserStore();
const { extensionReady } = useExtensionGate();
const sessionReady = computed(() => user.ready);
const sessionChecked = computed(() => user.sessionChecked);
const showLoginGate = computed(() => sessionChecked.value && extensionReady.value);

async function onLoginSuccess() {
  const redirect = sessionStorage.getItem("gamebet:postLoginRedirect");
  sessionStorage.removeItem("gamebet:postLoginRedirect");
  if (redirect && redirect !== "/" && redirect.startsWith("/")) {
    await router.replace(redirect);
  }
}
</script>

<template>
  <CopyShellBanner v-if="showDevSkinBanner()" />
  <HomeView v-if="sessionReady" />
  <PluginIntroShell v-else-if="showLoginGate" :show-login="true">
    <LoginPanel @success="onLoginSuccess" />
  </PluginIntroShell>
  <PluginIntroShell v-else :show-login="false" />
</template>
