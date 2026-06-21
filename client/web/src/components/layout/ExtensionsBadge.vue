<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";

/** 对齐 bundle `ExtensionsView` / class `version` / `yS.version` */
const WEB_BUNDLE_VERSION = "2.0.245";

const extVersion = ref<string | null>(null);
const remoteVersion = ref<string | null>(null);
const webVersion = ref<string | null>(null);
const tooltip = ref("当前已是最新版本");

const hasUpdate = ref(false);
let titleBase = "";
let titleTimer: ReturnType<typeof setInterval> | null = null;
let tick = 0;

async function fetchVersionJson(url: string): Promise<string | null> {
  try {
    const res = await fetch(`${url}?${Date.now()}`);
    if (!res.ok)
      return null;
    const data = (await res.json()) as { version?: string };
    const v = data.version?.trim();
    return v || null;
  }
  catch {
    return null;
  }
}

async function loadVersions() {
  extVersion.value = localStorage.getItem("extensionVersion");
  remoteVersion.value = await fetchVersionJson("/esport2/version.json");
  webVersion.value = await fetchVersionJson("/esport2/assets/version.json");

  const current = extVersion.value ?? WEB_BUNDLE_VERSION;
  const extMismatch = Boolean(remoteVersion.value && remoteVersion.value !== current);
  hasUpdate.value = extMismatch;
  if (extMismatch && remoteVersion.value) {
    tooltip.value = `最新版本：${remoteVersion.value}`;
  }
  else if (webVersion.value && webVersion.value !== WEB_BUNDLE_VERSION) {
    tooltip.value = `最新版本：${webVersion.value}`;
  }
  else {
    tooltip.value = "当前已是最新版本";
  }
}

function openDownload() {
  if (!hasUpdate.value || !remoteVersion.value)
    return;
  window.open(`/esport2/extensions/${remoteVersion.value}.zip`, "_blank");
}

onMounted(async () => {
  titleBase = document.title;
  await loadVersions();
  globalThis.addEventListener("gamebet-extension-version", loadVersions);
  titleTimer = setInterval(() => {
    tick += 1;
    document.title = `${titleBase}.${tick}`;
  }, 1000);
});

onUnmounted(() => {
  globalThis.removeEventListener("gamebet-extension-version", loadVersions);
  if (titleTimer)
    clearInterval(titleTimer);
  document.title = titleBase;
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
