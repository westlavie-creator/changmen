<script setup lang="ts">
import type { PodBetSettings } from "@/runtime/podBetSettings";

defineProps<{
  form: PodBetSettings;
}>();
</script>

<template>
  <div class="pod-yabo-settings">
    <p class="pod-yabo-settings__title">AutoYabo 决策</p>
    <p class="pod-yabo-settings__hint">
      独立模块 <code>runtime/podYabo</code>：EV 上下限、让球更高边、同场同向/反向闸门、自动等实时价、优先高 EV。
      「含副盘」只对 ±0.25 邻档，且必须用该档自己的 NVP，不会拿警报 NVP 去套隔壁线。
    </p>
    <el-form-item label="盘口">
      <el-switch
        :model-value="form.lineMatch === 'loose'"
        :disabled="!form.enabled"
        inline-prompt
        active-text="含副盘"
        inactive-text="只同档"
        @change="form.lineMatch = $event ? 'loose' : 'strict'"
      />
      <span class="pod-yabo-settings__note">副盘必须有该档 NVP</span>
    </el-form-item>
    <el-form-item label="让球边">
      <el-input-number
        v-model="form.spreadObEdgePct"
        :disabled="!form.enabled || !form.spreads"
        :min="0"
        :max="40"
        :step="0.5"
        :precision="1"
        controls-position="right"
      />
      <span class="pod-yabo-settings__unit">% 高于 NVP</span>
      <span class="pod-yabo-settings__note">默认比大小高</span>
    </el-form-item>
    <el-form-item label="EV 上限">
      <el-input-number
        v-model="form.maxObEdgePct"
        :disabled="!form.enabled"
        :min="0"
        :max="80"
        :step="1"
        :precision="1"
        controls-position="right"
      />
      <span class="pod-yabo-settings__unit">%</span>
      <span class="pod-yabo-settings__note">0 = 不封顶；默认 18 挡错盘假边</span>
    </el-form-item>
  </div>
</template>

<style scoped>
.pod-yabo-settings {
  margin-top: 4px;
  padding-top: 8px;
  border-top: 1px dashed #e2e8f0;
}
.pod-yabo-settings__title {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
}
.pod-yabo-settings__hint {
  margin: 0 0 10px;
  font-size: 12px;
  color: #64748b;
  line-height: 1.5;
}
.pod-yabo-settings__hint code {
  font-size: 11px;
  color: #334155;
}
.pod-yabo-settings__unit,
.pod-yabo-settings__note {
  margin-left: 8px;
  font-size: 12px;
  color: #64748b;
}
</style>
