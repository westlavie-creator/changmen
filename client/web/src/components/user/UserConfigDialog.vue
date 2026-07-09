<script setup lang="ts">
import type { UserConfigFormState } from "@/components/user/userConfigFormState";
import { ElMessage } from "element-plus";
import { storeToRefs } from "pinia";
/**
 * 用户配置弹窗，组件使用 Element Plus。
 */
import { computed, onMounted, reactive, ref, watch } from "vue";
import {
  createUserConfigFormState,

} from "@/components/user/userConfigFormState";
import UserConfigPanel from "@/components/user/UserConfigPanel.vue";
import { normalizeWaitTime } from "@/shared/betTiming";
import { useUserStore } from "@/stores/userStore";

const props = defineProps<{
  open: boolean;
  readonly?: boolean;
  previewForm?: UserConfigFormState;
  zIndex?: number;
}>();
const emit = defineEmits<{ close: [] }>();

const userStore = useUserStore();
const { configSaving: saving } = storeToRefs(userStore);

let form = reactive(createUserConfigFormState(userStore.config));
const autoOpenDate = ref<Date | null>(null);

const visible = computed({
  get: () => props.open,
  set: (v: boolean) => {
    if (!v)
      emit("close");
  },
});

function syncFormFromStore() {
  Object.assign(form, createUserConfigFormState(userStore.config));
  autoOpenDate.value = form.bettingAutoOpenTime ? new Date(form.bettingAutoOpenTime) : null;
}

watch(autoOpenDate, (v) => {
  form.bettingAutoOpenTime = v ? v.getTime() : 0;
});

function syncForm() {
  if (props.previewForm) {
    Object.assign(form, structuredClone(props.previewForm));
    autoOpenDate.value = form.bettingAutoOpenTime ? new Date(form.bettingAutoOpenTime) : null;
    return;
  }
  syncFormFromStore();
}

watch(
  () => props.open,
  (v) => {
    if (v)
      syncForm();
  },
);

watch(
  () => props.previewForm,
  () => {
    if (props.open && props.previewForm)
      syncForm();
  },
  { deep: true },
);

onMounted(async () => {
  if (props.previewForm) {
    syncForm();
    return;
  }
  if (!userStore.configLoaded)
    await userStore.loadConfig();
  syncFormFromStore();
});

async function save() {
  if (props.readonly)
    return;
  Object.assign(userStore.config, {
    ...form,
    profit: Number(form.profit),
    maxProfit: Number(form.maxProfit) || 1.1,
    makeProfit: Number(form.makeProfit) || 1.01,
    betMoney: Number(form.betMoney) || 100,
    valueBetMoney: Number(form.valueBetMoney) >= 0 ? Math.round(Number(form.valueBetMoney)) : 100,
    valueBetConfirm: form.valueBetConfirm !== false,
    minMoney: Number(form.minMoney) || 0,
    maxMoney: Number(form.maxMoney) || 0,
    minOdds: Number(form.minOdds) || 0,
    maxOdds: Number(userStore.config.maxOdds) || 10,
    checkTimeout: Number(form.checkTimeout) || 3000,
    betCount: Number(form.betCount) || 0,
    betInterval: Number(form.betInterval) || 30,
    anyOddsProfit: Number(form.anyOddsProfit) || 0.95,
    providerSortValue: [...form.providerSortValue],
    providerFixed: [...form.providerFixed],
    allowSameBet: [...form.allowSameBet],
    waitTime: normalizeWaitTime(form.waitTime),
  });
  try {
    const result = await userStore.saveConfig();
    if (result.ok)
      ElMessage.success("保存成功");
    else ElMessage.error(result.msg || "保存失败");
  }
  finally {
    emit("close");
    await userStore.fetchUserInfo();
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    title="参数配置"
    width="1000"
    append-to-body
    :z-index="zIndex"
    :close-on-press-escape="false"
    :close-on-click-modal="false"
  >
    <UserConfigPanel v-model:auto-open-date="autoOpenDate" v-model:form="form" :readonly="readonly">
      <template v-if="!readonly" #footer>
        <div class="flex flex-center" style="padding-top: 8px">
          <el-button
            size="default"
            type="primary"
            class="am-icon-save"
            :loading="saving"
            round
            style="width: 240px"
            @click="save"
          >
            &nbsp;保存配置
          </el-button>
        </div>
      </template>
    </UserConfigPanel>
  </el-dialog>
</template>
