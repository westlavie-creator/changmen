<script setup lang="ts">
import { shiftDateKey } from "@/shared/dateKey";

withDefaults(
  defineProps<{
    disabled?: boolean;
    placeholder?: string;
    pickerWidth?: string;
  }>(),
  {
    placeholder: "选择日期",
    pickerWidth: "106px",
  },
);

const emit = defineEmits<{
  change: [value: string];
}>();

const model = defineModel<string>({ required: true });

function onChange(value: string) {
  if (value)
    emit("change", value);
}

function shift(delta: number) {
  const next = shiftDateKey(model.value, delta);
  model.value = next;
  emit("change", next);
}
</script>

<template>
  <div class="date-nav">
    <el-button
      class="am-icon-arrow-left date-nav__arrow"
      size="small"
      :disabled="disabled"
      title="上一天"
      aria-label="上一天"
      @click="shift(-1)"
    />
    <el-date-picker
      v-model="model"
      type="date"
      value-format="YYYY-MM-DD"
      size="small"
      :clearable="false"
      :placeholder="placeholder"
      :style="{ width: pickerWidth }"
      :disabled="disabled"
      @change="onChange"
    />
    <el-button
      class="am-icon-arrow-right date-nav__arrow"
      size="small"
      :disabled="disabled"
      title="下一天"
      aria-label="下一天"
      @click="shift(1)"
    />
  </div>
</template>

<style scoped>
.date-nav {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.date-nav__arrow {
  min-width: 28px;
  padding: 5px 8px;
}
.date-nav--sidebar .date-nav__arrow {
  min-width: 22px;
  padding: 4px 4px;
}
.date-nav :deep(.el-input__prefix) {
  display: none;
}
.date-nav :deep(.el-input__wrapper) {
  padding-left: 6px;
  padding-right: 6px;
}
.date-nav--sidebar :deep(.el-input__wrapper) {
  padding-left: 3px;
  padding-right: 3px;
}
.date-nav :deep(.el-input__inner) {
  font-size: 12px;
}
.date-nav--sidebar :deep(.el-input__inner) {
  font-size: 11px;
  letter-spacing: -0.03em;
  padding: 0;
}
</style>
