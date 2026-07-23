<script setup lang="ts">
import { ElMessage } from "element-plus";
import { storeToRefs } from "pinia";
import { ref } from "vue";
import type { UiTheme } from "@/types/extensionPrefs";
import { useUserStore } from "@/stores/userStore";

const user = useUserStore();
const { extensionPrefs } = storeToRefs(user);
const saving = ref(false);

const uiThemeOptions: { value: UiTheme; label: string }[] = [
  { value: "default", label: "默认深色" },
  { value: "brutal", label: "Brutal（粗边框）" },
  { value: "paper", label: "浅纸感" },
  { value: "terminal", label: "终端风" },
];


async function save() {
  saving.value = true;
  try {
    await user.saveExtensionPrefs();
    ElMessage.success("保存成功");
  }
  catch (err) {
    ElMessage.error(err instanceof Error ? err.message : "保存失败");
  }
  finally {
    saving.value = false;
  }
}
</script>

<template>
  <el-form label-width="150px" class="extensions-tab">
    <div class="extensions-tab__row">
      <el-form-item label="界面皮肤:" class="extensions-tab__control extensions-tab__control--theme">
        <el-radio-group v-model="extensionPrefs.uiTheme" size="large" class="theme-radios">
          <el-radio
            v-for="opt in uiThemeOptions"
            :key="opt.value"
            :value="opt.value"
            border
          >
            {{ opt.label }}
          </el-radio>
        </el-radio-group>
      </el-form-item>
    </div>

    <div class="extensions-tab__row">
      <el-form-item label="BetRow 扩展 UI:" class="extensions-tab__control">
        <el-switch
          v-model="extensionPrefs.betRowUi"
          inline-prompt
          active-text="开启"
          inactive-text="关闭"
          size="large"
        />
      </el-form-item>
      <p class="extensions-tab__desc">
        套利连线、利润角标、赔率 flash、EV 金色标记。关闭可减轻主界面 CPU。
      </p>
    </div>

    <div class="extensions-tab__row">
      <el-form-item label="9999 单边预检:" class="extensions-tab__control">
        <el-switch
          v-model="extensionPrefs.singleLeg9999Precheck"
          inline-prompt
          active-text="开启"
          inactive-text="关闭"
          size="large"
        />
      </el-form-item>
      <p class="extensions-tab__desc">
        开：9999 本侧参与预检（失败整笔不下，本侧仍不下单）。关：跳过预检，仅对侧下单。
      </p>
    </div>

    <div class="extensions-tab__row">
      <el-form-item label="9999 用正EV金额:" class="extensions-tab__control">
        <el-switch
          v-model="extensionPrefs.singleLeg9999UseValueBetMoney"
          inline-prompt
          active-text="开启"
          inactive-text="关闭"
          size="large"
        />
      </el-form-item>
      <p class="extensions-tab__desc">
        开：真下单腿用参数配置的正EV金额；预检腿仍用套利计划额。关：仍用套利拆分金额。
      </p>
    </div>

    <el-divider content-position="left">
      高利润加仓
    </el-divider>

    <div class="extensions-tab__row">
      <el-form-item label="启用加仓:" class="extensions-tab__control">
        <el-switch
          v-model="extensionPrefs.stakeScaleByProfit.enabled"
          inline-prompt
          active-text="开启"
          inactive-text="关闭"
          size="large"
        />
      </el-form-item>
      <p class="extensions-tab__desc">
        implied 达阈值时两腿注码同乘；对冲比例不变。默认关闭。
      </p>
    </div>

    <div class="extensions-tab__row">
      <el-form-item label="利润阈值:" class="extensions-tab__control">
        <el-input-number
          v-model="extensionPrefs.stakeScaleByProfit.minImplied"
          :min="1.01"
          :max="2"
          :step="0.01"
          :precision="2"
          controls-position="right"
        />
      </el-form-item>
      <p class="extensions-tab__desc">
        1.05 = 利润 ≥ 5% 时触发加仓。
      </p>
    </div>

    <div class="extensions-tab__row">
      <el-form-item label="金额倍数:" class="extensions-tab__control">
        <el-input-number
          v-model="extensionPrefs.stakeScaleByProfit.multiplier"
          :min="1.1"
          :max="10"
          :step="0.1"
          :precision="1"
          controls-position="right"
        />
      </el-form-item>
      <p class="extensions-tab__desc">
        例如 2 = 注码 ×2。
      </p>
    </div>

    <div class="extensions-tab__row">
      <el-form-item label="加仓忽略账号比例:" class="extensions-tab__control">
        <el-switch
          v-model="extensionPrefs.stakeScaleByProfit.skipAccountRateOnScale"
          inline-prompt
          active-text="开启"
          inactive-text="关闭"
          size="large"
        />
      </el-form-item>
      <p class="extensions-tab__desc">
        开：触发加仓时，预检/下注按 Plan 金额换算，不乘账号比例系数。关：仍按账号比例配置缩放（默认）。
      </p>
    </div>

    <el-divider content-position="left">
      套利失败减仓
    </el-divider>

    <div class="extensions-tab__row">
      <el-form-item label="自动卖 PM/PF:" class="extensions-tab__control">
        <el-switch
          v-model="extensionPrefs.arbFailAutoSell.enabled"
          inline-prompt
          active-text="开启"
          inactive-text="关闭"
          size="large"
        />
      </el-form-item>
      <p class="extensions-tab__desc">
        开：双边套利中 PM/PF 腿已成交、对侧拒单且未能补单（或补单随后放弃）时，自动市价卖掉该预测市场腿。默认关闭；不做止盈，仅风控减仓。9999 单边不触发。
      </p>
    </div>

    <div class="flex flex-center">
      <el-button type="primary" class="am-icon-save" size="large" :loading="saving" @click="save">
        &nbsp;保存
      </el-button>
    </div>
  </el-form>
</template>

<style scoped>
.extensions-tab__row {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 4px;
}

.extensions-tab__control {
  flex: 0 0 320px;
  margin-bottom: 12px;
}

.extensions-tab__control--theme {
  flex: 1 1 520px;
  max-width: 720px;
}

.theme-radios {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.theme-radios :deep(.el-radio) {
  margin-right: 0;
}

.extensions-tab__desc {
  flex: 1;
  min-width: 0;
  margin: 8px 0 12px;
  padding-top: 2px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}

.extensions-tab :deep(.el-divider) {
  margin: 8px 0 16px;
}
</style>
