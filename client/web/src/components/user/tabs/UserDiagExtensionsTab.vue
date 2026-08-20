<script setup lang="ts">
import { ElMessage } from "element-plus";
import { storeToRefs } from "pinia";
import { computed, ref } from "vue";
import { ARB_FAIL_AUTO_SELL_AVAILABLE } from "@/types/extensionPrefs";
import { useUserStore } from "@/stores/userStore";

const user = useUserStore();
const { extensionPrefs } = storeToRefs(user);
const saving = ref(false);
const arbFailAutoSellAvailable = ARB_FAIL_AUTO_SELL_AVAILABLE;

const pbWsShadowUi = computed({
  get: () => user.pbWsShadowUi === true,
  set: (on: boolean) => {
    void user.setPbWsShadowUi(on);
  },
});

const pbChangmenExtensions = computed({
  get: () => user.pbChangmenExtensions === true,
  set: (on: boolean) => {
    void user.setPbChangmenExtensions(on);
  },
});

const arbFailAutoSellTip = computed(() =>
  arbFailAutoSellAvailable
    ? "开：双边套利中 PM/PF 腿已成交、对侧拒单且未能补单（或补单随后放弃）时，自动市价卖掉该预测市场腿。默认关闭；不做止盈，仅风控减仓。9999 单边不触发。"
    : "暂不可开启（与补单 prune 叠加有误卖敞口风险，验证后再放开）。功能保留，开关锁定为关。",
);

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
  <div class="extensions-tab">
    <div class="extensions-tab__cols">
      <el-form label-position="left" label-width="158px" class="extensions-tab__panel">
        <h3 class="extensions-tab__heading">
          PB / 9999
        </h3>

        <el-form-item>
          <template #label>
            <el-tooltip
              placement="top"
              :show-after="200"
              popper-class="extensions-tab-tip"
              content="默认关 = 对齐 A8（仅滚球 euro/odds 写主价 fo，不采赛前）。开 = changmen 扩展（live+prematch 双循环、赛前也写 fo）。仅本机 localStorage。"
            >
              <span class="extensions-tab__tip-label">PB changmen 扩展</span>
            </el-tooltip>
          </template>
          <el-switch
            v-model="pbChangmenExtensions"
            inline-prompt
            active-text="开"
            inactive-text="关"
          />
        </el-form-item>

        <el-form-item v-if="pbChangmenExtensions">
          <template #label>
            <el-tooltip
              placement="top"
              :show-after="200"
              popper-class="extensions-tab-tip"
              content="开总开关后默认开。主价不变。影子=官网 WS + SPA euro/odds。可单独关掉。需扩展 1.3.31+ 并重载 part888。"
            >
              <span class="extensions-tab__tip-label">PB WS 影子价</span>
            </el-tooltip>
          </template>
          <el-switch
            v-model="pbWsShadowUi"
            inline-prompt
            active-text="开"
            inactive-text="关"
          />
        </el-form-item>

        <el-form-item v-else>
          <template #label>
            <span class="extensions-tab__tip-label extensions-tab__tip-label--muted">PB WS 影子价</span>
          </template>
          <span class="extensions-tab__hint-inline">需先开 PB changmen 扩展</span>
        </el-form-item>

        <el-form-item>
          <template #label>
            <el-tooltip
              placement="top"
              :show-after="200"
              popper-class="extensions-tab-tip"
              content="开：9999 本侧参与预检（失败整笔不下，本侧仍不下单）。关：跳过预检，仅对侧下单。"
            >
              <span class="extensions-tab__tip-label">9999 单边预检</span>
            </el-tooltip>
          </template>
          <el-switch
            v-model="extensionPrefs.singleLeg9999Precheck"
            inline-prompt
            active-text="开"
            inactive-text="关"
          />
        </el-form-item>

        <el-form-item>
          <template #label>
            <el-tooltip
              placement="top"
              :show-after="200"
              popper-class="extensions-tab-tip"
              content="开：真下单腿用参数配置的正EV金额；预检腿仍用套利计划额。关：仍用套利拆分金额。"
            >
              <span class="extensions-tab__tip-label">9999 用正EV金额</span>
            </el-tooltip>
          </template>
          <el-switch
            v-model="extensionPrefs.singleLeg9999UseValueBetMoney"
            inline-prompt
            active-text="开"
            inactive-text="关"
          />
        </el-form-item>

        <h3 class="extensions-tab__heading extensions-tab__heading--next">
          Polymarket
        </h3>

        <el-form-item>
          <template #label>
            <el-tooltip
              placement="top"
              :show-after="200"
              popper-class="extensions-tab-tip"
              content="开：有 fo 的 PM 展示/扫描/FOK = 卖一 × 倍数（如 0.886×1.01）。无 fo 不打折。结算仍用成交价。关 = 现网。"
            >
              <span class="extensions-tab__tip-label">套利卖一缓冲</span>
            </el-tooltip>
          </template>
          <el-switch
            v-model="extensionPrefs.pmArbPriceBuffer.enabled"
            inline-prompt
            active-text="开"
            inactive-text="关"
          />
        </el-form-item>

        <el-form-item>
          <template #label>
            <el-tooltip
              placement="top"
              :show-after="200"
              popper-class="extensions-tab-tip"
              content="卖一 CLOB 价乘以该倍数。默认 1.01（1%）；保存后写入 Extensions。"
            >
              <span class="extensions-tab__tip-label">卖一倍数</span>
            </el-tooltip>
          </template>
          <el-input-number
            v-model="extensionPrefs.pmArbPriceBuffer.multiplier"
            class="extensions-tab__num"
            :min="1.01"
            :max="1.1"
            :step="0.01"
            :precision="2"
            :disabled="!extensionPrefs.pmArbPriceBuffer.enabled"
            controls-position="right"
          />
        </el-form-item>
      </el-form>

      <div class="extensions-tab__panel">
        <el-form label-position="left" label-width="158px">
          <h3 class="extensions-tab__heading">
            高利润加仓
          </h3>

          <el-form-item>
            <template #label>
              <el-tooltip
                placement="top"
                :show-after="200"
                popper-class="extensions-tab-tip"
                content="implied 达阈值时两腿注码同乘；对冲比例不变。默认关闭。"
              >
                <span class="extensions-tab__tip-label">启用加仓</span>
              </el-tooltip>
            </template>
            <el-switch
              v-model="extensionPrefs.stakeScaleByProfit.enabled"
              inline-prompt
              active-text="开"
              inactive-text="关"
            />
          </el-form-item>

          <el-form-item>
            <template #label>
              <el-tooltip
                placement="top"
                :show-after="200"
                popper-class="extensions-tab-tip"
                content="1.05 = 利润 ≥ 5% 时触发加仓。"
              >
                <span class="extensions-tab__tip-label">利润阈值</span>
              </el-tooltip>
            </template>
            <el-input-number
              v-model="extensionPrefs.stakeScaleByProfit.minImplied"
              class="extensions-tab__num"
              :min="1.01"
              :max="2"
              :step="0.01"
              :precision="2"
              controls-position="right"
            />
          </el-form-item>

          <el-form-item>
            <template #label>
              <el-tooltip
                placement="top"
                :show-after="200"
                popper-class="extensions-tab-tip"
                content="例如 2 = 注码 ×2。"
              >
                <span class="extensions-tab__tip-label">金额倍数</span>
              </el-tooltip>
            </template>
            <el-input-number
              v-model="extensionPrefs.stakeScaleByProfit.multiplier"
              class="extensions-tab__num"
              :min="1.1"
              :max="10"
              :step="0.1"
              :precision="1"
              controls-position="right"
            />
          </el-form-item>

          <el-form-item>
            <template #label>
              <el-tooltip
                placement="top"
                :show-after="200"
                popper-class="extensions-tab-tip"
                content="开：触发加仓时，预检/下注按 Plan 金额换算，不乘账号比例系数。关：仍按账号比例配置缩放（默认）。"
              >
                <span class="extensions-tab__tip-label">加仓忽略账号比例</span>
              </el-tooltip>
            </template>
            <el-switch
              v-model="extensionPrefs.stakeScaleByProfit.skipAccountRateOnScale"
              inline-prompt
              active-text="开"
              inactive-text="关"
            />
          </el-form-item>

          <h3 class="extensions-tab__heading extensions-tab__heading--next">
            套利失败减仓
          </h3>

          <el-form-item>
            <template #label>
              <el-tooltip
                placement="top"
                :show-after="200"
                popper-class="extensions-tab-tip"
                :content="arbFailAutoSellTip"
              >
                <span class="extensions-tab__tip-label">自动卖 PM/PF</span>
              </el-tooltip>
            </template>
            <el-switch
              v-model="extensionPrefs.arbFailAutoSell.enabled"
              :disabled="!arbFailAutoSellAvailable"
              inline-prompt
              active-text="开"
              inactive-text="关"
            />
          </el-form-item>

          <h3 class="extensions-tab__heading extensions-tab__heading--next">
            提前锁利
          </h3>

          <el-form-item>
            <template #label>
              <el-tooltip
                placement="top"
                :show-after="200"
                popper-class="extensions-tab-tip"
                content="仅对「两边都是预测市场（PM/PF）」的未结套利生效：两边同时市价卖出，同卖净利 ≥ 锁定利润 × (1+额外%) 才触发。庄+预测市场不会触发（避免打单边）。默认关闭。"
              >
                <span class="extensions-tab__tip-label">启用提前锁利</span>
              </el-tooltip>
            </template>
            <el-switch
              v-model="extensionPrefs.arbEarlyLockSell.enabled"
              inline-prompt
              active-text="开"
              inactive-text="关"
            />
          </el-form-item>

          <el-form-item>
            <template #label>
              <el-tooltip
                placement="top"
                :show-after="200"
                popper-class="extensions-tab-tip"
                content="双边同卖净利相对锁定利润至少再多出的百分比。0 = 刚好 ≥ 锁定即两边同卖；10 = 至少多 10%。"
              >
                <span class="extensions-tab__tip-label">额外利润(%)</span>
              </el-tooltip>
            </template>
            <el-input-number
              v-model="extensionPrefs.arbEarlyLockSell.minExtraProfitPct"
              class="extensions-tab__num"
              :min="0"
              :max="500"
              :step="1"
              :precision="0"
              controls-position="right"
            />
          </el-form-item>
        </el-form>
      </div>
    </div>

    <div class="flex flex-center extensions-tab__save">
      <el-button type="primary" class="am-icon-save" size="large" :loading="saving" @click="save">
        &nbsp;保存
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.extensions-tab {
  min-width: min(780px, 92vw);
}

.extensions-tab__cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  align-items: start;
}

.extensions-tab__panel {
  margin: 0;
  padding: 14px 16px 6px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-fill-color-blank);
  box-sizing: border-box;
}

.extensions-tab__heading {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--el-text-color-primary);
}

.extensions-tab__heading--next {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-extra-light);
}

.extensions-tab__tip-label {
  display: inline-block;
  max-width: 100%;
  cursor: help;
  border-bottom: 1px dashed var(--el-border-color);
  line-height: 1.3;
}

.extensions-tab__tip-label--muted {
  cursor: default;
  border-bottom: none;
  color: var(--el-text-color-secondary);
}

.extensions-tab__hint-inline {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 32px;
}

.extensions-tab__panel :deep(.el-form-item) {
  margin-bottom: 10px;
}

.extensions-tab__panel :deep(.el-form-item__label) {
  justify-content: flex-start;
  line-height: 32px;
  height: auto;
  padding-right: 12px;
  color: var(--el-text-color-regular);
}

.extensions-tab__panel :deep(.el-form-item__content) {
  justify-content: flex-start;
  min-width: 120px;
}

.extensions-tab__num {
  width: 120px;
}

.extensions-tab__save {
  margin-top: 16px;
}

@media (max-width: 900px) {
  .extensions-tab {
    min-width: 0;
  }

  .extensions-tab__cols {
    grid-template-columns: 1fr;
  }
}
</style>

<style>
.extensions-tab-tip {
  max-width: 360px;
  line-height: 1.5;
  white-space: normal;
}
</style>
