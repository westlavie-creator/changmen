<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  COPY_A8_MODULE_HREF,
  COPY_MODULE_SEGMENTS_MANIFEST,
  getUseA8Css,
  isDevSkinLab,
  setUseA8Css,
} from "@/lib/copyShell";

const legacyOk = ref(false);
const moduleSkinOk = ref(false);
const moduleSkinMode = ref<"segments" | "fallback" | "bundle" | "missing">("missing");
const useA8 = ref(getUseA8Css());

const envLabel = computed(() => (isDevSkinLab() ? "dev" : "prod"));

const moduleSkinLabel = computed(() => {
  if (useA8.value) return "";
  if (moduleSkinMode.value === "segments") return "segments";
  if (moduleSkinMode.value === "fallback") return "a8-all";
  if (moduleSkinMode.value === "bundle") return "a8-all";
  return "?";
});

const switchTitle = computed(() =>
  useA8.value ? "当前 legacy（Vite bundle），点击切 modules" : "当前 modules，点击切 legacy",
);

onMounted(() => {
  useA8.value = getUseA8Css();

  if (import.meta.env.PROD) {
    legacyOk.value = useA8.value;
    if (!useA8.value) {
      void fetch(COPY_A8_MODULE_HREF, { method: "HEAD" }).then((res) => {
        moduleSkinOk.value = res.ok;
        moduleSkinMode.value = res.ok ? "bundle" : "missing";
      });
    }
    return;
  }

  void fetch("/copy/styles/legacy/a8.css", { method: "HEAD" }).then((res) => {
    legacyOk.value = res.ok;
  });
  void fetch(COPY_MODULE_SEGMENTS_MANIFEST, { method: "HEAD" }).then(async (segRes) => {
    if (segRes.ok) {
      moduleSkinOk.value = true;
      moduleSkinMode.value = "segments";
      return;
    }
    const allRes = await fetch(COPY_A8_MODULE_HREF, { method: "HEAD" });
    moduleSkinOk.value = allRes.ok;
    moduleSkinMode.value = allRes.ok ? "fallback" : "missing";
  });
});

function toggleA8() {
  setUseA8Css(!useA8.value);
}
</script>

<template>
  <div
    class="copy-preview-banner"
    :data-styles="legacyOk || moduleSkinOk ? 'ok' : undefined"
    :data-a8="useA8 ? 'on' : 'off'"
  >
    <div class="copy-preview-banner__title">
      {{ envLabel }} · skin{{
        useA8 ? " · legacy（Vite bundle）" : moduleSkinLabel ? ` · modules/${moduleSkinLabel}` : " · modules"
      }}
    </div>
    <div class="copy-preview-banner__switch-row">
      <span class="copy-preview-banner__switch-label" :class="{ 'is-active': !useA8 }">modules</span>
      <button
        type="button"
        role="switch"
        class="copy-preview-banner__switch"
        :aria-checked="useA8"
        :title="switchTitle"
        @click.stop.prevent="toggleA8"
      >
        <span class="copy-preview-banner__switch-track" aria-hidden="true">
          <span class="copy-preview-banner__switch-thumb" />
        </span>
      </button>
      <span class="copy-preview-banner__switch-label" :class="{ 'is-active': useA8 }">legacy</span>
    </div>
    <p v-if="!import.meta.env.PROD && !legacyOk" class="copy-preview-banner__warn">
      缺少 legacy 样式，请运行 node public/copy/sync-styles.mjs
    </p>
    <p v-else-if="!useA8 && !moduleSkinOk" class="copy-preview-banner__warn">
      缺少 modules 皮肤（/copy/styles/modules/a8-all.css），请重新 app:build
    </p>
    <p v-else-if="!useA8 && import.meta.env.PROD" class="copy-preview-banner__hint">
      生产 modules 试验中；有问题切 legacy 或控制台：localStorage.setItem('copy:useA8Css','1'); location.reload()
    </p>
    <p v-else-if="!useA8" class="copy-preview-banner__hint">
      modules = segments + changmen；走查主界面用 modules，对照生产请切 legacy
    </p>
  </div>
</template>
