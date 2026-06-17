<script setup lang="ts">
import { computed, ref } from "vue";
import { ElMessage } from "element-plus";
import { storeToRefs } from "pinia";
import { NOTIFY_TYPES } from "@/types/notifyTypes";
import { TELEGRAM_BOT_URL, TELEGRAM_BOT_NAME } from "@/config/gamebetExtension";
import { sendMessage } from "@/api/esport";
import { useUserStore } from "@/stores/userStore";

const user = useUserStore();
const { message } = storeToRefs(user);
const pushLocked = ref(true);
const saving = ref(false);

const notifyArbProgress = computed({
  get: () => message.value.notifyArbProgress === true,
  set: (v: boolean) => {
    message.value.notifyArbProgress = v;
  },
});

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

async function testTelegram() {
  const chatId = message.value.telegramId?.trim();
  if (!chatId) {
    ElMessage.warning("请先填写 TelegramID");
    return;
  }
  try {
    const ok = await sendMessage({
      chat_id: chatId.split(",")[0]?.trim(),
      text: "<b>测试消息</b>\nTelegram 推送配置正常。",
      parse_mode: "HTML",
    });
    if (ok) ElMessage.success("测试消息已发送，请在 Telegram 查看");
    else ElMessage.error("发送失败");
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : "发送失败");
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
    <el-form-item label="套利进度报告:">
      <el-checkbox v-model="notifyArbProgress">
        开启投注时推送执行时间线（含检测失败、预检、下单；与 📣下单提醒 并存）
      </el-checkbox>
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
      <el-link :href="TELEGRAM_BOT_URL" target="_blank">{{ TELEGRAM_BOT_NAME }}</el-link>
    </el-form-item>
    <div class="flex flex-center">
      <el-button type="primary" class="am-icon-save" size="large" :loading="saving" @click="save">
        &nbsp;保存
      </el-button>
      <el-button size="large" style="margin-left: 12px" @click="testTelegram">发送测试</el-button>
    </div>
  </el-form>
</template>
