<script setup lang="ts">
import { ref } from "vue";
import { ElMessage } from "element-plus";
import { storeToRefs } from "pinia";
import { NOTIFY_TYPES } from "@/constants/notifyTypes";
import { useUserStore } from "@/stores/userStore";

const user = useUserStore();
const { message } = storeToRefs(user);
const pushLocked = ref(true);
const saving = ref(false);

function unlockPush(type: string) {
  if (type === "OrderPush") pushLocked.value = false;
}

async function save() {
  saving.value = true;
  try {
    await user.saveMessageConfig();
    ElMessage.success("保存成功");
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="diag-tab diag-form">
    <label class="form-row">
      <span>TelegramID:</span>
      <input v-model="message.telegramId" type="text" />
    </label>
    <label class="form-row">
      <span>机器人推单:</span>
      <input v-model="message.pushOrderId" type="text" :disabled="pushLocked" />
    </label>
    <div class="form-row">
      <span>消息通知类型:</span>
      <div class="notify-types">
        <label
          v-for="type in NOTIFY_TYPES"
          :key="type"
          class="notify-type"
          @dblclick="unlockPush(type)"
        >
          {{ type }}
        </label>
      </div>
    </div>
    <div class="form-row">
      <span>机器人:</span>
      <a href="https://t.me/esportfight_bot" target="_blank" rel="noopener noreferrer">
        @esportfight_bot
      </a>
    </div>
    <div class="form-actions">
      <button type="button" class="save-btn" :disabled="saving" @click="save">保存</button>
    </div>
    <p class="diag-tab__hint">双击「OrderPush」可解锁机器人推单 ID 编辑</p>
  </div>
</template>

<style scoped>
.diag-form {
  font-size: 13px;
  color: #cbd5e1;
}
.form-row {
  display: grid;
  grid-template-columns: 120px 1fr;
  align-items: start;
  gap: 8px;
  margin-bottom: 12px;
}
.form-row input[type="text"] {
  padding: 6px 8px;
  border: 1px solid #475569;
  border-radius: 4px;
  background: #0f172a;
  color: #e2e8f0;
}
.form-row input:disabled {
  opacity: 0.55;
}
.form-row a {
  color: #38bdf8;
}
.notify-types {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
}
.notify-type {
  cursor: default;
  user-select: none;
}
.form-actions {
  display: flex;
  justify-content: center;
  margin-top: 8px;
}
.save-btn {
  padding: 8px 24px;
  background: #409eff;
  border: none;
  border-radius: 4px;
  color: #fff;
  cursor: pointer;
}
.diag-tab__hint {
  margin: 8px 0 0;
  font-size: 11px;
  color: #64748b;
}
</style>
