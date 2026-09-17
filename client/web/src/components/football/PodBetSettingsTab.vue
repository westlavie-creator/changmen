<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, watch } from "vue";
import {
  POD_BET_SETTINGS_UPDATED,
  POD_FOLLOW_STAKE_PRESETS,
  readPodBetSettings,
  writePodBetSettings,
  type PodBetSettings,
} from "@/runtime/podBetSettings";
import { listObSportFollowAccounts } from "@/runtime/obSportBetAccount";
import { useAccountStore } from "@/stores/accountStore";
import PodFollowAccountPicker from "@/components/football/PodFollowAccountPicker.vue";
import PodYaboSettings from "@/components/football/PodYaboSettings.vue";

const form = reactive<PodBetSettings>(readPodBetSettings());
const accounts = useAccountStore();
const followAccounts = computed(() => listObSportFollowAccounts(accounts.accounts));

/** write / apply 期间挡掉回声，避免深监听空转或互相覆盖 */
let ready = false;
let gate = false;

function snapshot(): PodBetSettings {
  return {
    ...form,
    followAccountIds: form.followAccountIds.slice(),
    followAccountId: form.followAccountIds[0] || 0,
  };
}

function persist() {
  if (!ready || gate)
    return;
  gate = true;
  try {
    writePodBetSettings(snapshot());
  }
  finally {
    gate = false;
  }
}

function applyExternal() {
  if (gate)
    return;
  gate = true;
  try {
    const next = readPodBetSettings();
    form.enabled = next.enabled;
    form.prematchOnly = next.prematchOnly;
    form.footballOnly = next.footballOnly;
    form.includeHt = next.includeHt;
    form.moneyline = next.moneyline;
    form.totals = next.totals;
    form.spreads = next.spreads;
    form.minDropPct = next.minDropPct;
    form.minObEdgePct = next.minObEdgePct;
    form.spreadObEdgePct = next.spreadObEdgePct;
    form.maxObEdgePct = next.maxObEdgePct;
    form.lineMatch = next.lineMatch;
    form.minOdds = next.minOdds;
    form.maxOdds = next.maxOdds;
    form.maxAgeSec = next.maxAgeSec;
    form.stake = next.stake;
    form.autoPlace = next.autoPlace;
    form.maxDailyLoss = next.maxDailyLoss;
    form.followAccountId = next.followAccountId;
    const cur = form.followAccountIds;
    const ids = next.followAccountIds;
    if (cur.length !== ids.length || cur.some((id, i) => id !== ids[i]))
      form.followAccountIds = ids.slice();
  }
  finally {
    gate = false;
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
  // destroy-on-close：关窗前强制落盘（含未 blur 的数字）
  gate = false;
  ready = true;
  try {
    writePodBetSettings(snapshot());
  }
  catch { /* ignore */ }
});
</script>

<template>
  <div class="pod-bet-settings">
    <p class="pod-bet-settings__hint">
      跟单门槛只存在本机，不写账号配置。过线且对上足球板的场和盘，才会出现在「POD 跟单」浮窗并一直留下，降赔列表本身不筛。
      对 OB 时仍要同一场、默认同档。EV / 副盘 / 同场闸门在下面「AutoYabo 决策」。
      每条会标<strong>已下 / 未下</strong>；下单用下面选的跟单账号（可多选，每个号各下一注）。
      自动只打<strong>已确认</strong>的场，猜测场可手点。板上没有这场才热搜一次。
      「时效」= 降赔出现后允许对场/核价/下单的短管道（默认 30s），对齐 AutoYabo「新票立刻打」；过时不再自动，列表仍留。改完即时写入本机。
    </p>
    <el-form label-position="left" label-width="132px" class="pod-bet-settings__form" size="small">
      <el-form-item label="启用筛选">
        <el-switch v-model="form.enabled" inline-prompt active-text="开" inactive-text="关" />
      </el-form-item>
      <el-form-item label="自动下注">
        <el-switch v-model="form.autoPlace" :disabled="!form.enabled" inline-prompt active-text="开" inactive-text="关" />
        <span class="pod-bet-settings__note">默认关；开了才自动下过线且<strong>已确认</strong>的场</span>
      </el-form-item>
      <el-form-item label="跟单账号">
        <PodFollowAccountPicker
          v-model="form.followAccountIds"
          :accounts="followAccounts"
          variant="settings"
        />
      </el-form-item>
      <el-form-item label="当日亏损帽">
        <el-input-number
          v-model="form.maxDailyLoss"
          :min="0"
          :max="1000000"
          :step="50"
          :precision="0"
          controls-position="right"
        />
        <span class="pod-bet-settings__unit">元</span>
        <span class="pod-bet-settings__note">0 = 不限；只挡自动</span>
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
        <span class="pod-bet-settings__note">大小 / 独赢</span>
      </el-form-item>
      <PodYaboSettings :form="form" />
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
          :min="0"
          :max="600"
          :step="5"
          controls-position="right"
        />
        <span class="pod-bet-settings__unit">秒内</span>
        <span class="pod-bet-settings__note">默认 30；0 = 不限（可打冷边）。过时不再自动，列表仍留</span>
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
