<script setup lang="ts">
import { onMounted } from "vue";

/** 旧版 A8 bundle 在 /console/（非 /app/console/），由 backend 静态托管。 */
onMounted(() => {
  window.location.replace("/console/");
});
</script>

<template>
  <p class="console-redirect">正在跳转到旧版控制台…</p>
</template>

<style scoped>
.console-redirect {
  padding: 48px 24px;
  text-align: center;
  color: #94a3b8;
  font-size: 14px;
}
</style>
