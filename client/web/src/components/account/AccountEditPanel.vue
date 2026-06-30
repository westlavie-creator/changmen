<script setup lang="ts">
import type { AccountEditFormState } from "@/components/account/accountEditFormState";
import { ref, watch } from "vue";
import { ALL_PLATFORMS } from "@/types/userConfig";

interface PlatformSuggestion { value: string; link: string }

const props = withDefaults(
  defineProps<{
    readonly?: boolean;
    rateLocked?: boolean;
    multiplyLocked?: boolean;
    gameExpanded?: boolean;
    proxyOptions?: { label: string; value: number }[];
    hideSensitive?: boolean;
    fetchPlatforms?: (query: string, cb: (rows: PlatformSuggestion[]) => void) => void;
  }>(),
  {
    proxyOptions: () => [{ label: "无代理", value: 0 }],
    multiplyLocked: true,
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
    <el-form-item label="平台：">
      <el-row :gutter="10">
        <el-col :span="6">
          <el-autocomplete
            v-if="fetchPlatforms && !readonly"
            v-model="form.platformName"
            clearable
            :fetch-suggestions="fetchPlatforms"
            value-key="value"
          />
          <el-input v-else v-model="form.platformName" :disabled="fieldDisabled()" />
        </el-col>
        <el-col :span="7">
          <el-input v-model="form.playerName" placeholder="账号" :disabled="fieldDisabled()">
            <template #prepend>
              账号
            </template>
          </el-input>
        </el-col>
        <el-col :span="6">
          <el-switch
            v-model="form.pause"
            size="large"
            inline-prompt
            active-text="暂停账号"
            inactive-text="暂停账号"
            style="height: 24px; --el-switch-on-color: #f56c6c"
            :disabled="fieldDisabled()"
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
              :key="multiplyLocked ? 'multiply-locked' : 'multiply-editable'"
              v-model.number="form.multiply"
              type="number"
              placeholder="乘网倍数"
              :readonly="multiplyLocked"
              :disabled="fieldDisabled()"
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

    <el-form-item label="场馆：">
      <el-radio-group v-model="form.provider" size="large" :disabled="fieldDisabled()">
        <el-radio v-for="p in ALL_PLATFORMS" :key="p" :value="p">
          {{ p }}
        </el-radio>
      </el-radio-group>
    </el-form-item>

    <template v-if="!hideSensitive">
      <el-form-item label="网关：">
        <el-input v-model="form.gateway" :disabled="fieldDisabled()" />
      </el-form-item>
      <slot name="token" />
      <el-form-item v-if="form.provider !== 'Polymarket'" label="Token：">
        <el-input v-model="form.token" :disabled="fieldDisabled()" />
      </el-form-item>
      <el-form-item label="Referer：">
        <el-input v-model="form.referer" :disabled="fieldDisabled()" />
      </el-form-item>
      <el-form-item label="UserAgent:">
        <el-input
          v-model="form.userAgent"
          placeholder="请求访问的浏览器标识，不知道可留空"
          :disabled="fieldDisabled()"
        />
      </el-form-item>
      <el-form-item label="Cookie：">
        <el-input v-model="form.cookie" :disabled="fieldDisabled()" />
      </el-form-item>
    </template>
    <el-form-item v-else-if="form.gateway" label="网关：">
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
  </el-form>
</template>

<style scoped>
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

.account-edit-panel--readonly :deep(.el-input.is-disabled .el-input__inner),
.account-edit-panel--readonly :deep(.el-input.is-disabled .el-input__wrapper) {
  cursor: default;
}
</style>
