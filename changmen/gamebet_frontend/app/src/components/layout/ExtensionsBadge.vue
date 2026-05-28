<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";

/** 对齐 bundle `ExtensionsView` / class `version` */
const WEB_BUNDLE_VERSION = "2.0.229";

const extVersion = ref<string | null>(null);
const remoteVersion = ref<string | null>(null);
const webVersion = ref<string | null>(null);
const titleBase = ref(document.title);
let titleTimer: ReturnType<typeof setInterval> | null = null;
let tick = 0;

const hasUpdate = ref(false);
const tooltip = ref("当前已是最新版本");

async function loadVersions() {
  extVersion.value = localStorage.getItem("extensionVersion");
  try {
    const res = await fetch(`https://api.a8.to/esport2/version.json?${Date.now()}`);
    const data = (await res.json()) as { version?: string };
    remoteVersion.value = data.version ?? null;
  } catch {
    remoteVersion.value = null;
  }
  try {
    const res = await fetch(`https://api.a8.to/esport2/assets/version.json?${Date.now()}`);
    const data = (await res.json()) as { version?: string };
    webVersion.value = data.version ?? null;
  } catch {
    webVersion.value = null;
  }

  const current = extVersion.value ?? WEB_BUNDLE_VERSION;
  hasUpdate.value = Boolean(remoteVersion.value && remoteVersion.value !== current);
  if (hasUpdate.value) {
    tooltip.value = `最新版本：${remoteVersion.value}`;
  } else if (webVersion.value && webVersion.value !== WEB_BUNDLE_VERSION) {
    tooltip.value = `最新版本：${webVersion.value}`;
  } else {
    tooltip.value = "当前已是最新版本";
  }
}

function openDownload() {
  if (!hasUpdate.value || !remoteVersion.value) return;
  window.open(`/console/extensions/${remoteVersion.value}.zip`, "_blank");
}

onMounted(async () => {
  titleBase.value = document.title;
  await loadVersions();
  titleTimer = setInterval(() => {
    tick += 1;
    document.title = `${titleBase.value}.${tick}`;
  }, 1000);
});

onUnmounted(() => {
  if (titleTimer) clearInterval(titleTimer);
  document.title = titleBase.value;
});
</script>

<template>
  <div
    class="version"
    :class="{ new: hasUpdate }"
    :title="tooltip"
    @click="openDownload"
  >
    {{ extVersion ?? WEB_BUNDLE_VERSION }}
  </div>
</template>
