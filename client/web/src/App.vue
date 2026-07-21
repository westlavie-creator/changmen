<script setup lang="ts">
import { ElConfigProvider } from "element-plus";
import zhCn from "element-plus/es/locale/lang/zh-cn";
import { storeToRefs } from "pinia";
import { watchEffect } from "vue";
import { applyUiTheme } from "@/shared/applyUiTheme";
import { useUserStore } from "@/stores/userStore";

const { extensionPrefs } = storeToRefs(useUserStore());

watchEffect(() => {
  applyUiTheme(extensionPrefs.value.uiTheme);
});
</script>

<template>
  <ElConfigProvider :locale="zhCn">
    <router-view />
  </ElConfigProvider>
</template>
