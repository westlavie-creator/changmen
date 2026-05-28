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
  <el-form label-width="120px">
    <el-form-item label="TelegramID:">
      <el-input v-model="message.telegramId" />
    </el-form-item>
    <el-form-item label="机器人推单:">
      <el-input v-model="message.pushOrderId" :disabled="pushLocked" />
    </el-form-item>
    <el-form-item label="消息通知类型:">
      <label
        v-for="type in NOTIFY_TYPES"
        :key="type"
        style="margin-right: 8px"
        @dblclick="unlockPush(type)"
      >
        {{ type }}&nbsp;&nbsp;
      </label>
    </el-form-item>
    <el-form-item label="机器人:">
      <el-link href="https://t.me/esportfight_bot" target="_blank">@esportfight_bot</el-link>
    </el-form-item>
    <div class="flex flex-center">
      <el-button type="primary" class="am-icon-save" size="large" :loading="saving" @click="save">
        &nbsp;保存
      </el-button>
    </div>
  </el-form>
</template>
