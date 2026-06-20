<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { COPY_EP_CHALK_HREF, getUseA8Css, isDevSkinLab, setUseA8Css } from "@/lib/copyShell";

const moduleSkinOk = ref(false);
const useA8 = ref(getUseA8Css());
const isProd = import.meta.env.PROD;

const envLabel = computed(() => (isDevSkinLab() ? "dev" : "prod"));

const switchTitle = computed(() =>
  useA8.value ? "当前 legacy（Vite bundle），点击切 modules" : "当前 modules（EP + changmen），点击切 legacy",
);

onMounted(() => {
  useA8.value = getUseA8Css();
  if (useA8.value) return;
  void fetch(COPY_EP_CHALK_HREF, { method: "HEAD" }).then((res) => {
    moduleSkinOk.value = res.ok;
  });
});

function toggleA8() {
  setUseA8Css(!useA8.value);
}
</script>

<template>
  <div
    class="copy-preview-banner"
    :data-styles="moduleSkinOk ? 'ok' : undefined"
    :data-a8="useA8 ? 'on' : 'off'"
  >
    <div class="copy-preview-banner__title">
      {{ envLabel }} · skin{{
        useA8 ? " · legacy（Vite bundle）" : " · modules（EP + changmen）"
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
    <p v-if="!useA8 && !moduleSkinOk" class="copy-preview-banner__warn">
      缺少 ep-chalk.css，请运行 npm run predev 或 node scripts/bootstrap-ep-chalk.mjs
    </p>
    <p v-else-if="!useA8 && isProd" class="copy-preview-banner__hint">
      生产 modules；有问题切 legacy 或 localStorage.setItem('copy:useA8Css','1'); location.reload()
    </p>
    <p v-else-if="!useA8" class="copy-preview-banner__hint">
      modules = Element Plus 官方主题 + changmen；对照 A8 视觉请切 legacy
    </p>
    <p v-else class="copy-preview-banner__hint">
      legacy 仅 Vite 加载 a8.css 等 8 个文件；Network 验证请清空记录并关闭 Preserve log
    </p>
  </div>
</template>
