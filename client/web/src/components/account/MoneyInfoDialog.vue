<script setup lang="ts">
import type { CurrencyCode } from "@/shared/currency";
import { ElMessage } from "element-plus";
import { computed, ref, watch } from "vue";
import { getMoneyLog, saveMoneyLog } from "@/api/esport";
import { Currency, MONEY_CURRENCIES } from "@/shared/currency";

/** 对齐 A8 bundle `MoneyInfoView`（lDe） */
const props = defineProps<{
  open: boolean;
  playerId: number;
  logId?: number;
}>();

const emit = defineEmits<{ close: []; saved: [] }>();

const typeLabels: Record<string, string> = {
  Lose: "被黑",
  Recharge: "充值",
  Withdraw: "提现",
};

const visible = ref(false);
const loading = ref(false);

const form = ref({
  ID: 0,
  UserID: 0,
  PlayerID: 0,
  Currency: Currency.CNY as CurrencyCode,
  Type: "Recharge" as "Recharge" | "Withdraw" | "Lose",
  Money: 0,
  Description: "",
  IsAuto: 0 as 0 | 1,
  CreateAt: Date.now(),
});

const isAutoSwitch = computed({
  get: () => form.value.IsAuto === 1,
  set: (v: boolean) => {
    form.value.IsAuto = v ? 1 : 0;
  },
});

const canSave = computed(() => !!form.value.Money);

const createAtModel = computed({
  get: () => new Date(form.value.CreateAt),
  set: (v: Date) => {
    form.value.CreateAt = v?.getTime?.() ?? Date.now();
  },
});

watch(
  () => props.open,
  (open) => {
    visible.value = open;
  },
  { immediate: true },
);

watch(
  () => [props.open, props.logId, props.playerId] as const,
  async ([open, logId, playerId]) => {
    if (!open)
      return;
    loading.value = true;
    try {
      form.value.PlayerID = playerId;
      if (logId) {
        const row = await getMoneyLog(logId);
        if (!row) {
          ElMessage.error("记录不存在");
          visible.value = false;
          return;
        }
        form.value = {
          ID: row.ID ?? row.logId ?? logId,
          UserID: 0,
          PlayerID: playerId,
          Currency: (row.Currency ?? row.currency ?? Currency.CNY) as CurrencyCode,
          Type: (row.Type ?? row.type ?? "Recharge") as typeof form.value.Type,
          Money: Number(row.Money ?? row.money) || 0,
          Description: row.Description ?? row.description ?? row.Remark ?? "",
          IsAuto: (row.IsAuto ?? row.isAuto ?? 0) as 0 | 1,
          CreateAt: Number(row.CreateAt ?? row.createAt) || Date.now(),
        };
      }
      else {
        form.value = {
          ID: 0,
          UserID: 0,
          PlayerID: playerId,
          Currency: Currency.CNY,
          Type: "Recharge",
          Money: 0,
          Description: "",
          IsAuto: 0,
          CreateAt: Date.now(),
        };
      }
    }
    finally {
      loading.value = false;
    }
  },
  { immediate: true },
);

function onDescriptionChange() {
  const c = /\d+sec|\d+s$/i;
  if (
    form.value.Type === "Withdraw"
    && form.value.Description
    && c.test(form.value.Description)
  ) {
    form.value.IsAuto = 1;
  }
}

function onClosed() {
  emit("close");
}

async function save() {
  if (!canSave.value)
    return;
  const ok = await saveMoneyLog({
    logId: props.logId,
    playerId: props.playerId,
    type: form.value.Type,
    createAt: form.value.CreateAt,
    currency: form.value.Currency,
    description: form.value.Description,
    money: form.value.Money ?? 0,
    isAuto: form.value.IsAuto === 1,
  });
  if (ok) {
    ElMessage.success("保存成功");
    visible.value = false;
    emit("saved");
    emit("close");
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    title="添加资金记录"
    width="480"
    append-to-body
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    @closed="onClosed"
  >
    <el-form :disabled="loading">
      <el-row>
        <el-col :span="12">
          <el-form-item label="币种:">
            <el-radio-group v-model="form.Currency">
              <el-radio-button v-for="c in MONEY_CURRENCIES" :key="c" :label="c" :value="c">
                {{ c }}
              </el-radio-button>
            </el-radio-group>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="类型:">
            <el-radio-group v-model="form.Type">
              <el-radio-button
                v-for="(label, key) in typeLabels"
                :key="key"
                :label="label"
                :value="key"
              >
                {{ label }}
              </el-radio-button>
            </el-radio-group>
          </el-form-item>
        </el-col>
      </el-row>

      <el-form-item label="金额:">
        <el-input v-model.number="form.Money" class="money-item">
          <template #prepend>
            {{ typeLabels[form.Type] }} {{ form.Currency }}
          </template>
          <template #append>
            <el-date-picker
              v-model="createAtModel"
              type="datetime"
              placeholder="充提时间"
              style="width: 100%"
            />
          </template>
        </el-input>
      </el-form-item>

      <div class="flex flex-middle" style="gap: 10px">
        <el-form-item label="备注:" class="flex-1">
          <el-input v-model="form.Description" @change="onDescriptionChange" />
        </el-form-item>
        <el-form-item v-if="form.Type === 'Withdraw'" class="isAuto">
          <el-switch
            v-model="isAutoSwitch"
            size="large"
            inline-prompt
            active-text="秒出"
            inactive-text="秒出"
            style="--el-switch-on-color: #13ce66; --el-switch-off-color: #ccc"
          />
        </el-form-item>
      </div>

      <el-form-item>
        <el-button
          class="am-icon-save"
          type="primary"
          style="width: 100%"
          :disabled="!canSave"
          @click="save"
        >
          保存
        </el-button>
      </el-form-item>
    </el-form>
  </el-dialog>
</template>
