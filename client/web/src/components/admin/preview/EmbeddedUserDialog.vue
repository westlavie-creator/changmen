<script setup lang="ts">
defineProps<{
  title: string;
  width?: string;
}>();

defineEmits<{ close: [] }>();
</script>

<template>
  <div
    class="embedded-user-dialog"
    :style="width ? { width, maxWidth: '100%' } : undefined"
    role="dialog"
    aria-modal="false"
  >
    <header class="embedded-user-dialog__header">
      <span class="embedded-user-dialog__title">{{ title }}</span>
      <button type="button" class="embedded-user-dialog__close" title="关闭" @click="$emit('close')">
        ×
      </button>
    </header>
    <div class="embedded-user-dialog__body">
      <slot />
    </div>
    <footer v-if="$slots.footer" class="embedded-user-dialog__footer">
      <slot name="footer" />
    </footer>
  </div>
</template>

<style scoped>
.embedded-user-dialog {
  margin: 0 auto;
  background: var(--el-dialog-bg-color, var(--el-bg-color));
  border-radius: var(--el-dialog-border-radius, 4px);
  box-shadow: var(--el-dialog-box-shadow, var(--el-box-shadow));
  overflow: hidden;
}
.embedded-user-dialog__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  margin-right: 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.embedded-user-dialog__title {
  font-size: var(--el-dialog-title-font-size, 16px);
  font-weight: 500;
  color: var(--el-text-color-primary);
  line-height: 1.4;
}
.embedded-user-dialog__close {
  border: none;
  background: transparent;
  color: var(--el-text-color-secondary);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  padding: 0 4px;
}
.embedded-user-dialog__close:hover {
  color: var(--el-text-color-primary);
}
.embedded-user-dialog__body {
  padding: 12px 20px 20px;
}
.embedded-user-dialog__footer {
  padding: 12px 20px 16px;
  border-top: 1px solid var(--el-border-color-lighter);
}
</style>
