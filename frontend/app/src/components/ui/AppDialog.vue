<script setup lang="ts">
defineProps<{
  open: boolean;
  title: string;
  width?: string;
}>();

const emit = defineEmits<{ close: [] }>();

function onBackdrop(e: MouseEvent) {
  if ((e.target as HTMLElement).classList.contains("app-dialog")) {
    emit("close");
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="app-dialog" @click="onBackdrop">
      <div class="app-dialog__panel" :style="{ width: width ?? '420px' }" role="dialog">
        <header class="app-dialog__head flex flex-between flex-middle">
          <strong>{{ title }}</strong>
          <button type="button" class="app-dialog__close" aria-label="关闭" @click="emit('close')">
            ×
          </button>
        </header>
        <div class="app-dialog__body">
          <slot />
        </div>
        <footer v-if="$slots.footer" class="app-dialog__foot">
          <slot name="footer" />
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.app-dialog {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
  padding: 16px;
}
.app-dialog__panel {
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 32px);
  overflow: auto;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 8px;
  color: #e2e8f0;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
}
.app-dialog__head {
  padding: 12px 14px;
  border-bottom: 1px solid #334155;
}
.app-dialog__close {
  border: none;
  background: transparent;
  color: #94a3b8;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}
.app-dialog__body {
  padding: 14px;
}
.app-dialog__foot {
  padding: 10px 14px 14px;
  border-top: 1px solid #334155;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
