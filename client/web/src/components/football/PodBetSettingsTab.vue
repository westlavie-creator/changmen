<script setup lang="ts">
import { onMounted, onUnmounted, reactive, watch } from "vue";
import {
  parsePodBetSettings,
  POD_BET_SETTINGS_UPDATED,
  POD_FOLLOW_STAKE_PRESETS,
  readPodBetSettings,
  writePodBetSettings,
  type PodBetSettings,
} from "@/runtime/podBetSettings";

const form = reactive<PodBetSettings>(parsePodBetSettings(null));
let ready = false;
let applying = false;

function persist() {
  if (!ready || applying)
    return;
  applying = true;
  try {
    Object.assign(form, writePodBetSettings(form));
  }
  finally {
    applying = false;
  }
}

function applyExternal() {
  if (applying)
    return;
  applying = true;
  try {
    Object.assign(form, readPodBetSettings());
  }
  finally {
    applying = false;
  }
}

watch(form, persist, { deep: true });

onMounted(() => {
  applyExternal();
  ready = true;
  window.addEventListener(POD_BET_SETTINGS_UPDATED, applyExternal);
});

onUnmounted(() => {
  window.removeEventListener(POD_BET_SETTINGS_UPDATED, applyExternal);
});
</script>

<template>
  <div class="pod-bet-settings">
    <p class="pod-bet-settings__hint">
      跟单门槛只存在本机，不写账号配置。过线的会出现在「POD 跟单」浮窗，降赔列表本身不筛。
      对 OB 时仍要同一场、同一条线，且 OB 报价至少达到「最低 OB」。
      <strong>自动下注默认关</strong>，只在本页点「下单」或手动打开自动。
    </p>
    <el-form label-position="left" label-width="132px" class="pod-bet-settings__form" size="small">
      <el-form-item label="启用筛选">
        <el-switch v-model="form.enabled" inline-prompt active-text="开" inactive-text="关" />
      </el-form-item>
      <el-form-item label="自动下注">
        <el-switch v-model="form.autoPlace" :disabled="!form.enabled" inline-prompt active-text="开" inactive-text="关" />
        <span class="pod-bet-settings__note">默认关；开了才自动下过线且对上 OB 的票</span>
      </el-form-item>
      <el-form-item label="下注金额">
        <el-input-number
          v-model="form.stake"
          :min="0"
          :max="1000000"
          :step="10"
          :precision="0"
          controls-position="right"
        />
        <span class="pod-bet-settings__unit">元</span>
        <button
          v-for="n in POD_FOLLOW_STAKE_PRESETS"
          :key="n"
          type="button"
          class="pod-bet-settings__chip"
          :class="{ 'is-on': form.stake === n }"
          @click="form.stake = n"
        >
          {{ n }}
        </button>
      </el-form-item>
      <el-form-item label="只跟早盘">
        <el-switch v-model="form.prematchOnly" :disabled="!form.enabled" inline-prompt active-text="开" inactive-text="关" />
        <span class="pod-bet-settings__note">滚球默认丢掉</span>
      </el-form-item>
      <el-form-item label="只要足球">
        <el-switch v-model="form.footballOnly" :disabled="!form.enabled" inline-prompt active-text="开" inactive-text="关" />
      </el-form-item>
      <el-form-item label="含半场">
        <el-switch v-model="form.includeHt" :disabled="!form.enabled" inline-prompt active-text="开" inactive-text="关" />
        <span class="pod-bet-settings__note">默认只全场</span>
      </el-form-item>
      <el-form-item label="玩法">
        <el-checkbox v-model="form.moneyline" :disabled="!form.enabled">
          独赢
        </el-checkbox>
        <el-checkbox v-model="form.totals" :disabled="!form.enabled">
          大小
        </el-checkbox>
        <el-checkbox v-model="form.spreads" :disabled="!form.enabled">
          让球
        </el-checkbox>
      </el-form-item>
      <el-form-item label="最小降幅">
        <el-input-number
          v-model="form.minDropPct"
          :disabled="!form.enabled"
          :min="0"
          :max="80"
          :step="1"
          :precision="1"
          controls-position="right"
        />
        <span class="pod-bet-settings__unit">%</span>
      </el-form-item>
      <el-form-item label="OB 边">
        <el-input-number
          v-model="form.minObEdgePct"
          :disabled="!form.enabled"
          :min="0"
          :max="40"
          :step="0.5"
          :precision="1"
          controls-position="right"
        />
        <span class="pod-bet-settings__unit">% 高于 NVP</span>
      </el-form-item>
      <el-form-item label="赔率带">
        <el-input-number
          v-model="form.minOdds"
          :disabled="!form.enabled"
          :min="1.01"
          :max="20"
          :step="0.05"
          :precision="2"
          controls-position="right"
        />
        <span class="pod-bet-settings__unit">至</span>
        <el-input-number
          v-model="form.maxOdds"
          :disabled="!form.enabled"
          :min="1.05"
          :max="50"
          :step="0.05"
          :precision="2"
          controls-position="right"
        />
      </el-form-item>
      <el-form-item label="时效">
        <el-input-number
          v-model="form.maxAgeSec"
          :disabled="!form.enabled"
          :min="5"
          :max="600"
          :step="5"
          controls-position="right"
        />
        <span class="pod-bet-settings__unit">秒内</span>
      </el-form-item>
    </el-form>
  </div>
</template>

<style scoped>
.pod-bet-settings__hint {
  margin: 0 0 12px;
  font-size: 12px;
  color: #64748b;
  line-height: 1.5;
}
.pod-bet-settings__hint strong {
  color: #0f172a;
}
.pod-bet-settings__form :deep(.el-form-item) {
  margin-bottom: 10px;
}
.pod-bet-settings__form :deep(.el-input-number) {
  width: 120px;
}
.pod-bet-settings__unit,
.pod-bet-settings__note {
  margin-left: 8px;
  font-size: 12px;
  color: #64748b;
}
.pod-bet-settings__chip {
  margin-left: 6px;
  padding: 2px 8px;
  border: 1px solid #cbd5e1;
  border-radius: 999px;
  background: #fff;
  color: #334155;
  font-size: 12px;
  cursor: pointer;
}
.pod-bet-settings__chip.is-on,
.pod-bet-settings__chip:hover {
  color: #92400e;
  border-color: #f59e0b;
  background: #fffbeb;
}
</style>
