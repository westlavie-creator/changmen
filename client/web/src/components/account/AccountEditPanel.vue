<script setup lang="ts">
import type { AccountEditFormState } from "@/components/account/accountEditFormState";
import { ref, watch } from "vue";
import PlatformIcon from "@/components/platform/PlatformIcon.vue";
import { ALL_PLATFORMS } from "@/types/userConfig";

const POLYMARKET_OFFICIAL_REFERRAL_URL = "https://polymarket.com/?r=f43e";

interface PlatformSuggestion { value: string; link: string }

const props = withDefaults(
  defineProps<{
    readonly?: boolean;
    rateLocked?: boolean;
    multiplyEditable?: boolean;
    pauseEditable?: boolean;
    gameExpanded?: boolean;
    proxyOptions?: { label: string; value: number }[];
    hideSensitive?: boolean;
    fetchPlatforms?: (query: string, cb: (rows: PlatformSuggestion[]) => void) => void;
  }>(),
  {
    proxyOptions: () => [{ label: "无代理", value: 0 }],
  },
);

const emit = defineEmits<{
  unlockRate: [];
  addRate: [];
  removeRate: [index: number];
  markupOnlyChange: [];
  noMarkupChange: [];
  normalizeGameOdds: [gameName: string];
}>();

// eslint-disable-next-line prefer-const -- defineModel ref is not reassigned, but Vue compiler requires `let`
let form = defineModel<AccountEditFormState>("form", { required: true });

const gameShow = ref(props.gameExpanded ?? false);

watch(
  () => props.gameExpanded,
  (v) => {
    if (v !== undefined)
      gameShow.value = v;
  },
);

function fieldDisabled(extra = false) {
  return props.readonly || extra;
}

function multiplyFieldDisabled() {
  if (props.multiplyEditable)
    return false;
  return fieldDisabled();
}

function pauseFieldDisabled() {
  if (props.pauseEditable)
    return false;
  return fieldDisabled();
}

function onMarkupOnlyChange() {
  if (props.readonly)
    return;
  emit("markupOnlyChange");
}

function onNoMarkupChange() {
  if (props.readonly)
    return;
  emit("noMarkupChange");
}

function toggleGame() {
  if (props.readonly)
    return;
  gameShow.value = !gameShow.value;
}

function unlockRate() {
  if (props.readonly)
    return;
  emit("unlockRate");
}
</script>

<template>
  <el-form label-width="100" class="account-edit-panel" :class="{ 'account-edit-panel--readonly': readonly }">
    <div class="account-edit-panel__columns">
      <div class="account-edit-panel__col account-edit-panel__col--left">
    <el-form-item label="平台：">
      <el-row :gutter="10" align="middle">
        <el-col :span="5">
          <el-autocomplete
            v-if="fetchPlatforms && !readonly"
            v-model="form.platformName"
            clearable
            :fetch-suggestions="fetchPlatforms"
            value-key="value"
          />
          <el-input v-else v-model="form.platformName" :disabled="fieldDisabled()" />
        </el-col>
        <el-col :span="5">
          <el-input
            v-model="form.playerName"
            placeholder="选填，空则用平台账号"
            :disabled="fieldDisabled()"
          >
            <template #prepend>
              账号
            </template>
          </el-input>
        </el-col>
        <el-col :span="8">
          <div class="account-edit-panel__venue" title="场馆返回的真实账号信息（查余额后更新）">
            <span class="account-edit-panel__venue-item">
              <span class="account-edit-panel__venue-label">平台账号</span>
              <span class="account-edit-panel__venue-value">{{ form.venueAccountName || "—" }}</span>
            </span>
            <span class="account-edit-panel__venue-item">
              <span class="account-edit-panel__venue-label">账号ID</span>
              <span class="account-edit-panel__venue-value account-edit-panel__venue-value--mono">{{ form.venueMemberId || "—" }}</span>
            </span>
          </div>
        </el-col>
        <el-col :span="6">
          <el-switch
            v-model="form.pause"
            size="large"
            inline-prompt
            active-text="暂停账号"
            inactive-text="暂停账号"
            style="height: 24px; --el-switch-on-color: #f56c6c"
            :disabled="pauseFieldDisabled()"
          />
        </el-col>
      </el-row>
    </el-form-item>

    <fieldset class="account-edit-panel__fieldset">
      <legend>
        <span @dblclick="unlockRate">投</span>
        注比例
        <el-button v-if="!readonly" size="small" type="info" link @click="emit('addRate')">
          <i class="am-icon-plus am-icon-fw" />
        </el-button>
      </legend>
      <el-form-item
        v-for="(row, index) in form.rateConfig"
        :key="index"
        :label="`比例配置${index + 1}:`"
      >
        <el-row :gutter="10">
          <el-col :span="6">
            <el-input
              v-model.number="row.minOdds"
              type="number"
              placeholder="最低赔率"
              :disabled="fieldDisabled()"
            >
              <template #prepend>
                低赔
              </template>
            </el-input>
          </el-col>
          <el-col :span="6">
            <el-input
              v-model.number="row.maxOdds"
              type="number"
              placeholder="最高赔率"
              :disabled="fieldDisabled()"
            >
              <template #prepend>
                高赔
              </template>
            </el-input>
          </el-col>
          <el-col :span="6">
            <el-input
              v-model.number="row.rate"
              type="number"
              placeholder="比例"
              :disabled="fieldDisabled(rateLocked)"
            >
              <template #prepend>
                比例
              </template>
            </el-input>
          </el-col>
          <el-col v-if="!readonly" :span="6">
            <el-button size="small" type="danger" @click="emit('removeRate', index)">
              <i class="am-icon-times" />
            </el-button>
          </el-col>
        </el-row>
      </el-form-item>
      <p v-if="!form.rateConfig.length" class="account-edit-panel__empty">
        暂无比例配置
      </p>
    </fieldset>

    <fieldset class="account-edit-panel__fieldset game-container" :class="{ show: gameShow }">
      <legend>
        游戏配置
        <el-button v-if="!readonly" size="small" type="info" link @click="toggleGame">
          <i class="am-icon-arrow-circle-down am-icon-fw" />
        </el-button>
      </legend>
      <div class="game-container-setting">
        <el-form-item
          v-for="[gameName, gameRow] in Object.entries(form.game)"
          :key="gameName"
          :label="`${gameName}：`"
        >
          <el-row v-if="gameRow" :gutter="10">
            <el-col :span="6">
              <el-input
                v-model.number="gameRow.profit"
                placeholder="利润"
                :disabled="fieldDisabled()"
              >
                <template #prepend>
                  利润
                </template>
              </el-input>
            </el-col>
            <el-col :span="6">
              <el-input
                v-model.number="gameRow.betCount"
                placeholder="订单量"
                :disabled="fieldDisabled()"
              >
                <template #prepend>
                  订单数
                </template>
              </el-input>
            </el-col>
            <el-col :span="12">
              <el-input-tag
                v-if="!readonly"
                v-model="gameRow.odds"
                placeholder="赔率范围"
                @change="emit('normalizeGameOdds', gameName)"
              >
                <template #prepend>
                  赔率
                </template>
              </el-input-tag>
              <el-input
                v-else
                :model-value="gameRow.odds.join(', ')"
                placeholder="赔率范围"
                :disabled="fieldDisabled()"
              >
                <template #prepend>
                  赔率
                </template>
              </el-input>
            </el-col>
          </el-row>
        </el-form-item>
      </div>
    </fieldset>

    <el-divider />

    <el-row>
      <el-col :span="12">
        <el-form-item label="初始赔率：">
          <el-row :gutter="10">
            <el-col :span="12">
              <el-input v-model.number="form.minDefault" placeholder="最低" :disabled="fieldDisabled()">
                <template #prepend>
                  最低
                </template>
              </el-input>
            </el-col>
            <el-col :span="12">
              <el-input v-model.number="form.maxDefault" placeholder="最高" :disabled="fieldDisabled()">
                <template #prepend>
                  最高
                </template>
              </el-input>
            </el-col>
          </el-row>
        </el-form-item>
      </el-col>
      <el-col :span="12">
        <el-form-item label="投注赔率：">
          <el-row :gutter="10">
            <el-col :span="12">
              <el-input v-model.number="form.minOdds" placeholder="最低" :disabled="fieldDisabled()">
                <template #prepend>
                  最低
                </template>
              </el-input>
            </el-col>
            <el-col :span="12">
              <el-input v-model.number="form.maxOdds" placeholder="最高" :disabled="fieldDisabled()">
                <template #prepend>
                  最高
                </template>
              </el-input>
            </el-col>
          </el-row>
        </el-form-item>
      </el-col>
    </el-row>

    <el-row>
      <el-col :span="24">
        <el-form-item label="补单配置：">
          <el-row :gutter="10">
            <el-col :span="5">
              <el-switch
                v-model="form.markupOnly"
                size="large"
                inline-prompt
                active-text="仅限补单"
                inactive-text="仅限补单"
                style="height: 24px"
                :disabled="fieldDisabled()"
                @change="onMarkupOnlyChange"
              />
            </el-col>
            <el-col :span="5">
              <el-switch
                v-model="form.noMarkup"
                size="large"
                inline-prompt
                active-text="不参与补单"
                inactive-text="不参与补单"
                style="height: 24px"
                :disabled="fieldDisabled()"
                @change="onNoMarkupChange"
              />
            </el-col>
            <el-col :span="6">
              <el-input v-model.number="form.profit" type="number" placeholder="利润" :disabled="fieldDisabled()">
                <template #prepend>
                  利润
                </template>
              </el-input>
            </el-col>
            <el-col :span="6">
              <el-input
                v-model.number="form.maxBetCount"
                type="number"
                placeholder="下注单数"
                :disabled="fieldDisabled()"
              >
                <template #prepend>
                  盘口订单
                </template>
              </el-input>
            </el-col>
          </el-row>
        </el-form-item>
      </el-col>
    </el-row>

    <el-row>
      <el-col :span="24">
        <el-row :gutter="10">
          <el-col :span="9">
            <el-form-item label="工作时间：">
              <el-input-tag
                v-if="!readonly"
                v-model="form.workTimes"
                placeholder="格式:0-5，按回车添加"
              />
              <el-input
                v-else
                :model-value="form.workTimes.join(', ')"
                placeholder="格式:0-5"
                :disabled="fieldDisabled()"
              />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-switch
              v-model="form.lastOdds"
              size="large"
              inline-prompt
              active-text="赔率大于上笔"
              inactive-text="赔率大于上笔"
              :disabled="fieldDisabled()"
            />
          </el-col>
          <el-col :span="6">
            <el-input
              v-model.number="form.multiply"
              type="number"
              placeholder="乘网倍数"
              :readonly="!multiplyEditable"
              :disabled="multiplyFieldDisabled()"
            >
              <template #prepend>
                乘网
              </template>
            </el-input>
          </el-col>
        </el-row>
      </el-col>
    </el-row>

    <el-form-item label="盈利上限：">
      <el-row :gutter="10">
        <el-col :span="4">
          <el-input v-model="form.maxProfit" :disabled="fieldDisabled()" />
        </el-col>
        <el-col :span="6">
          <el-input v-model.number="form.maxOrder" placeholder="单日最多订单" :disabled="fieldDisabled()">
            <template #prepend>
              单日订单
            </template>
          </el-input>
        </el-col>
        <el-col :span="7">
          <el-input v-model="form.maxBalance" placeholder="最大余额" :disabled="fieldDisabled()">
            <template #prepend>
              最大余额
            </template>
          </el-input>
        </el-col>
        <el-col :span="6">
          <el-input v-model="form.maxBalanceOdds" placeholder="超额赔率" :disabled="fieldDisabled()">
            <template #prepend>
              超额赔率
            </template>
          </el-input>
        </el-col>
      </el-row>
    </el-form-item>

    <el-form-item label="盈利余额：">
      <el-row :gutter="10">
        <el-col :span="4">
          <el-tooltip
            content="账户余额加未结算订单(算赢)不能超过此项设定"
            placement="top"
            effect="dark"
          >
            <el-input v-model="form.maxWinBalance" :disabled="fieldDisabled()" />
          </el-tooltip>
        </el-col>
        <el-col :span="6">
          <el-input v-model="form.realName" :disabled="fieldDisabled()">
            <template #prepend>
              姓名
            </template>
          </el-input>
        </el-col>
        <el-col :span="7">
          <el-input v-model="form.mobile" :disabled="fieldDisabled()">
            <template #prepend>
              手机
            </template>
          </el-input>
        </el-col>
        <el-col :span="6">
          <el-input v-model="form.city" :disabled="fieldDisabled()">
            <template #prepend>
              城市
            </template>
          </el-input>
        </el-col>
      </el-row>
    </el-form-item>

    <el-form-item label="账号备注：">
      <el-input v-model="form.description" :disabled="fieldDisabled()" />
    </el-form-item>
      </div>

      <div class="account-edit-panel__col account-edit-panel__col--right">
    <el-form-item label="场馆：">
      <el-radio-group
        v-model="form.provider"
        size="large"
        class="account-edit-panel__providers"
        :disabled="fieldDisabled()"
      >
        <el-radio-button v-for="p in ALL_PLATFORMS" :key="p" :value="p" :title="p">
          <PlatformIcon :platform="p" />
        </el-radio-button>
      </el-radio-group>
    </el-form-item>
    <template v-if="!hideSensitive">
      <el-form-item v-if="form.provider === 'Polymarket'" label="官网链接：">
        <a
          class="poly-official-referral-link"
          :href="POLYMARKET_OFFICIAL_REFERRAL_URL"
          target="_blank"
          rel="noopener noreferrer"
        >
          https://polymarket.com
        </a>
      </el-form-item>
      <el-form-item label="网关：">
        <el-input v-model="form.gateway" :disabled="fieldDisabled()" />
      </el-form-item>
      <slot name="token" />
      <el-form-item v-if="form.provider !== 'Polymarket'" label="Token：">
        <el-input v-model="form.token" :disabled="fieldDisabled()" />
      </el-form-item>
      <el-form-item v-if="form.provider !== 'Polymarket'" label="Referer：">
        <el-input v-model="form.referer" :disabled="fieldDisabled()" />
      </el-form-item>
      <el-form-item v-if="form.provider !== 'Polymarket'" label="UserAgent:">
        <el-input
          v-model="form.userAgent"
          placeholder="请求访问的浏览器标识，不知道可留空"
          :disabled="fieldDisabled()"
        />
      </el-form-item>
      <el-form-item v-if="form.provider !== 'Polymarket'" label="Cookie：">
        <el-input v-model="form.cookie" :disabled="fieldDisabled()" />
      </el-form-item>
    </template>
    <el-form-item
      v-if="hideSensitive && form.provider === 'Polymarket'"
      label="官网链接："
    >
      <a
        class="poly-official-referral-link"
        :href="POLYMARKET_OFFICIAL_REFERRAL_URL"
        target="_blank"
        rel="noopener noreferrer"
      >
        https://polymarket.com
      </a>
    </el-form-item>
    <el-form-item v-if="hideSensitive && form.gateway" label="网关：">
      <el-input v-model="form.gateway" :disabled="fieldDisabled()" />
    </el-form-item>

    <el-form-item label="使用代理：">
      <el-radio-group v-model="form.proxyId" :disabled="fieldDisabled()">
        <el-radio v-for="opt in proxyOptions" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </el-radio>
      </el-radio-group>
    </el-form-item>

    <slot name="footer" />
      </div>
    </div>
  </el-form>
</template>

<style scoped>
.account-edit-panel__columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: start;
  gap: 32px;
}

.account-edit-panel__col {
  min-width: 0;
  padding: 0 4px;
}

.account-edit-panel__col--right {
  padding-left: 28px;
  border-left: 1px solid var(--el-border-color-lighter);
}

.account-edit-panel__providers {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-width: 100%;
}

.account-edit-panel__providers :deep(.el-radio-button) {
  margin: 0;
}

.account-edit-panel__providers :deep(.el-radio-button__inner) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border-radius: 8px;
}

.account-edit-panel__providers :deep(.provider-icon) {
  width: 28px;
  height: 28px;
}

.account-edit-panel__fieldset {
  margin: 0 0 12px;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  padding: 12px 14px 4px;
}

.account-edit-panel__fieldset legend {
  padding: 0 6px;
  font-size: 13px;
  font-weight: 600;
}

.account-edit-panel__empty {
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.account-edit-panel__venue {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  min-height: 32px;
  padding: 2px 0;
  font-size: 12px;
  line-height: 1.35;
  color: var(--el-text-color-regular);
}

.account-edit-panel__venue-item {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}

.account-edit-panel__venue-label {
  flex: 0 0 auto;
  color: var(--el-text-color-secondary);
}

.account-edit-panel__venue-label::after {
  content: "：";
}

.account-edit-panel__venue-value {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.account-edit-panel__venue-value--mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
}

.account-edit-panel--readonly :deep(.el-input.is-disabled .el-input__inner),
.account-edit-panel--readonly :deep(.el-input.is-disabled .el-input__wrapper) {
  cursor: default;
}

.poly-official-referral-link {
  color: var(--el-color-primary);
  word-break: break-all;
}
</style>
