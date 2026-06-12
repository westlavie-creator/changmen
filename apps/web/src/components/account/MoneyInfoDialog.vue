<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import { getMoneyLog, saveMoneyLog } from "@/api/esport";

const props = defineProps<{
  open: boolean;
  playerId: number;
  logId?: number;
}>();

const emit = defineEmits<{ close: []; saved: [] }>();

const visible = ref(false);
const loading = ref(false);
const saving = ref(false);

const typeLabels: Record<string, string> = {
  Recharge: "充值",
  Withdraw: "提现",
  Lose: "被黑",
};

const currencies = ["CNY", "USDT"] as const;

const form = reactive({
  currency: "CNY" as (typeof currencies)[number],
  type: "Recharge" as "Recharge" | "Withdraw" | "Lose",
  money: 0,
  description: "",
  createAt: Date.now(),
  isAuto: false,
});

const createAtModel = computed({
  get: () => new Date(form.createAt),
  set: (v: Date) => {
    form.createAt = v?.getTime?.() ?? Date.now();
  },
});

const canSave = computed(() => form.money > 0);

watch(
  () => props.open,
  (open) => {
    visible.value = open;
  },
  { immediate: true },
);

watch(
  () => [props.open, props.logId] as const,
  async ([open, logId]) => {
    if (!open) return;
    loading.value = true;
    try {
      if (logId) {
        const row = await getMoneyLog({ logId });
        if (!row) {
          ElMessage.error("记录不存在");
          visible.value = false;
          return;
        }
        form.type = (row.Type as typeof form.type) || "Recharge";
        form.currency = "CNY";
        form.money = Math.abs(Number(row.Money) || 0);
        form.description = row.Remark || "";
        form.createAt = Number(row.CreateAt) || Date.now();
        form.isAuto = false;
      } else {
        form.currency = "CNY";
        form.type = "Recharge";
        form.money = 0;
        form.description = "";
        form.createAt = Date.now();
        form.isAuto = false;
      }
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);

function onDescriptionChange() {
  if (form.type !== "Withdraw" || !form.description) return;
  if (/\d+sec|\d+s$/i.test(form.description)) form.isAuto = true;
}

function onClosed() {
  emit("close");
}

async function save() {
  if (!canSave.value) return;
  saving.value = true;
  try {
    const ok = await saveMoneyLog({
      logId: props.logId,
      playerId: props.playerId,
      type: form.type,
      money: form.money,
      description: form.description,
      createAt: form.createAt,
      isAuto: form.isAuto,
      currency: form.currency,
    });
    if (ok) {
      ElMessage.success("保存成功");
      visible.value = false;
      emit("saved");
      emit("close");
    } else {
      ElMessage.error("保存失败");
    }
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="logId ? '编辑资金记录' : '添加资金记录'"
    width="480"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    @closed="onClosed"
  >
    <el-form v-loading="loading" label-width="auto">
      <el-row>
        <el-col :span="12">
          <el-form-item label="币种:">
            <el-radio-group v-model="form.currency">
              <el-radio-button v-for="c in currencies" :key="c" :value="c">
                {{ c }}
              </el-radio-button>
            </el-radio-group>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="类型:">
            <el-radio-group v-model="form.type">
              <el-radio-button
                v-for="(label, key) in typeLabels"
                :key="key"
                :value="key"
              >
                {{ label }}
              </el-radio-button>
            </el-radio-group>
          </el-form-item>
        </el-col>
      </el-row>

      <el-form-item label="金额:">
        <el-input v-model.number="form.money" class="money-item">
          <template #prepend>{{ typeLabels[form.type] }} {{ form.currency }}</template>
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
          <el-input v-model="form.description" @change="onDescriptionChange" />
        </el-form-item>
        <el-form-item v-if="form.type === 'Withdraw'" class="isAuto">
          <el-switch
            v-model="form.isAuto"
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
          :loading="saving"
          @click="save"
        >
          保存
        </el-button>
      </el-form-item>
    </el-form>
  </el-dialog>
</template>
