<script setup lang="ts">
import CollectConfigPanel from "@/components/user/CollectConfigPanel.vue";
</script>

<template>
  <div class="diag-tab diag-tab--collect">
    <CollectConfigPanel embedded />
  </div>
</template>

<style scoped>
.diag-tab--collect :deep(.collect-panel) {
  border: none;
  padding: 0;
}
</style>
