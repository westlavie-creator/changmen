<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import AppDialog from "@/components/ui/AppDialog.vue";
import { getMoneyLog, saveMoneyLog } from "@/api/esport";

const props = defineProps<{
  open: boolean;
  playerId: number;
  logId?: number;
}>();

const emit = defineEmits<{ close: []; saved: [] }>();

const saving = reactive({ value: false });

const form = reactive({
  type: "Recharge" as "Recharge" | "Withdraw" | "Lose",
  money: 0,
  description: "",
  createAt: Date.now(),
  isAuto: false,
});

const typeLabels: Record<string, string> = {
  Recharge: "充值",
  Withdraw: "提现",
  Lose: "被黑",
};

const canSave = computed(() => form.money > 0);

watch(
  () => [props.open, props.logId] as const,
  async ([open, logId]) => {
    if (!open) return;
    if (logId) {
      const row = await getMoneyLog({ logId });
      if (row) {
        form.type = (row.Type as typeof form.type) || "Recharge";
        form.money = Math.abs(Number(row.Money) || 0);
        form.description = row.Remark || "";
        form.createAt = Number(row.CreateAt) || Date.now();
        form.isAuto = false;
      }
    } else {
      form.type = "Recharge";
      form.money = 0;
      form.description = "";
      form.createAt = Date.now();
      form.isAuto = false;
    }
  },
  { immediate: true },
);

watch(
  () => form.description,
  (desc) => {
    if (form.type !== "Withdraw" || !desc) return;
    if (/\d+sec|\d+s$/i.test(desc)) form.isAuto = true;
  },
);

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
      currency: "CNY",
    });
    if (ok) {
      emit("saved");
      emit("close");
    } else {
      window.alert("保存失败");
    }
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <AppDialog
    :open="open"
    :title="logId ? '编辑资金记录' : '添加资金记录'"
    width="480px"
    @close="emit('close')"
  >
    <div class="form">
      <fieldset class="type-group">
        <legend>类型</legend>
        <label v-for="(label, key) in typeLabels" :key="key" class="type-radio">
          <input v-model="form.type" type="radio" name="money-type" :value="key" />
          {{ label }}
        </label>
      </fieldset>
      <label class="form-row">
        <span>金额</span>
        <input v-model.number="form.money" type="number" min="0" step="1" />
      </label>
      <label class="form-row">
        <span>时间</span>
        <input
          :value="new Date(form.createAt).toISOString().slice(0, 16)"
          type="datetime-local"
          @input="
            form.createAt = new Date(($event.target as HTMLInputElement).value).getTime()
          "
        />
      </label>
      <label class="form-row">
        <span>备注</span>
        <input v-model="form.description" type="text" />
      </label>
      <label v-if="form.type === 'Withdraw'" class="form-row form-row--check">
        <input v-model="form.isAuto" type="checkbox" />
        <span>秒出</span>
      </label>
    </div>
    <template #footer>
      <button type="button" class="btn btn--ghost" @click="emit('close')">取消</button>
      <button type="button" class="btn btn--primary" :disabled="!canSave || saving.value" @click="save">
        {{ saving.value ? "保存中…" : "保存" }}
      </button>
    </template>
  </AppDialog>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.type-group {
  border: 1px solid #475569;
  border-radius: 4px;
  padding: 8px 10px;
  margin: 0;
}
.type-group legend {
  font-size: 12px;
  color: #94a3b8;
  padding: 0 4px;
}
.type-radio {
  margin-right: 12px;
  font-size: 13px;
  cursor: pointer;
}
.form-row {
  display: grid;
  grid-template-columns: 56px 1fr;
  gap: 8px;
  align-items: center;
  font-size: 13px;
}
.form-row span {
  color: #94a3b8;
}
.form-row--check {
  grid-template-columns: auto 1fr;
}
.form-row input {
  padding: 6px 8px;
  border: 1px solid #475569;
  border-radius: 4px;
  background: #0f172a;
  color: #e2e8f0;
}
.btn {
  padding: 6px 14px;
  border-radius: 4px;
  border: 1px solid #475569;
  cursor: pointer;
  font-size: 13px;
}
.btn--ghost {
  background: transparent;
  color: #cbd5e1;
}
.btn--primary {
  background: #059669;
  border-color: #059669;
  color: #fff;
}
.btn--primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
