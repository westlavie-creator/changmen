<script setup lang="ts">
import type { UserConfigFormState } from "@/components/user/userConfigFormState";
import { computed, ref } from "vue";
import {
  BET_SORTING_KEYS,
  BET_SORTING_LABELS,
  USER_CONFIG_LABEL_W,

  waitTimePlatformPairs,
} from "@/components/user/userConfigFormState";
import { ALL_PLATFORMS } from "@/types/userConfig";

const props = defineProps<{
  readonly?: boolean;
  autoOpenDate?: Date | null;
}>();

const emit = defineEmits<{
  "update:autoOpenDate": [Date | null];
}>();

const form = defineModel<UserConfigFormState>("form", { required: true });

const LABEL_W = USER_CONFIG_LABEL_W;
const sortingLabels = BET_SORTING_LABELS;
const sortingKeys = BET_SORTING_KEYS;
const platformPairs = waitTimePlatformPairs();

const dragIndex = ref(0);

const openDate = computed({
  get() {
    if (props.autoOpenDate !== undefined)
      return props.autoOpenDate;
    return form.value.bettingAutoOpenTime ? new Date(form.value.bettingAutoOpenTime) : null;
  },
  set(v: Date | null) {
    if (!props.readonly)
      emit("update:autoOpenDate", v);
  },
});

function fieldDisabled(extra = false) {
  return props.readonly || extra;
}

function onDragStart(index: number) {
  if (props.readonly)
    return;
  dragIndex.value = index;
}

function onDragEnter(index: number, e: DragEvent) {
  if (props.readonly)
    return;
  e.preventDefault();
  if (dragIndex.value === index)
    return;
  const moved = form.value.providerSortValue[dragIndex.value];
  form.value.providerSortValue.splice(dragIndex.value, 1);
  form.value.providerSortValue.splice(index, 0, moved);
  dragIndex.value = index;
}

function onDragOver(e: DragEvent) {
  if (props.readonly)
    return;
  e.preventDefault();
}

function setWaitTime(platform: string, v: string | number) {
  if (props.readonly)
    return;
  form.value.waitTime[platform] = Number(v) || 0;
}
</script>

<template>
  <el-form :model="form" class="user-config-panel" :class="{ 'user-config-panel--readonly': readonly }">
    <el-form-item>
      <div class="bet-money-row">
        <el-form-item label="投注金额:" :label-width="LABEL_W" class="bet-money-row__input">
          <el-input v-model="form.betMoney" autocomplete="off" :disabled="fieldDisabled()" style="width: 120px" />
        </el-form-item>
        <div class="bet-money-row__switches">
          <el-switch
            v-model="form.tenNumber"
            inline-prompt
            active-text="十位取整"
            inactive-text="十位取整"
            size="large"
            :disabled="fieldDisabled()"
          />
          <el-switch
            v-model="form.betting"
            inline-prompt
            active-text="开启投注"
            inactive-text="开启投注"
            size="large"
            :disabled="fieldDisabled()"
          />
          <el-switch
            v-if="!form.betting"
            v-model="form.bettingAutoOpen"
            inline-prompt
            active-text="定时打开"
            inactive-text="定时打开"
            size="large"
            :disabled="fieldDisabled()"
          />
        </div>
      </div>
    </el-form-item>

    <el-form-item v-if="!form.betting && form.bettingAutoOpen">
      <el-row>
        <el-col :span="8">
          <el-form-item label="开启时间:" :label-width="LABEL_W">
            <el-date-picker
              v-model="openDate"
              type="datetime"
              placeholder="Select date and time"
              :disabled="fieldDisabled()"
            />
          </el-form-item>
        </el-col>
      </el-row>
    </el-form-item>

    <el-form-item>
      <el-row>
        <el-col :span="6">
          <el-form-item label="最低投注:" :label-width="LABEL_W">
            <el-input v-model="form.minMoney" autocomplete="off" :disabled="fieldDisabled()" />
          </el-form-item>
        </el-col>
        <el-col :span="6">
          <el-form-item label="最高投注:" :label-width="LABEL_W">
            <el-input v-model="form.maxMoney" autocomplete="off" :disabled="fieldDisabled()" />
          </el-form-item>
        </el-col>
        <el-col :span="6">
          <el-form-item label="投注次数" :label-width="LABEL_W">
            <el-input v-model="form.betCount" autocomplete="off" :disabled="fieldDisabled()" />
          </el-form-item>
        </el-col>
        <el-col :span="6">
          <el-form-item label="投注间隔" :label-width="LABEL_W">
            <el-input v-model="form.betInterval" autocomplete="off" :disabled="fieldDisabled()">
              <template #append>
                秒
              </template>
            </el-input>
          </el-form-item>
        </el-col>
      </el-row>
    </el-form-item>

    <el-form-item>
      <el-row>
        <el-col :span="10">
          <el-form-item label="利润要求" :label-width="LABEL_W">
            <el-row>
              <el-col :span="10">
                <el-input
                  v-model="form.profit"
                  type="number"
                  autocomplete="off"
                  :disabled="fieldDisabled()"
                />
              </el-col>
              <el-col :span="2" class="text-gray-500">
                <span>-</span>
              </el-col>
              <el-col :span="10">
                <el-input
                  v-model="form.maxProfit"
                  type="number"
                  autocomplete="off"
                  :disabled="fieldDisabled()"
                />
              </el-col>
            </el-row>
          </el-form-item>
        </el-col>
        <el-col :span="7">
          <el-form-item label="最低赔率" :label-width="LABEL_W">
            <el-input v-model="form.minOdds" type="text" autocomplete="off" :disabled="fieldDisabled()" />
          </el-form-item>
        </el-col>
        <el-col :span="7">
          <el-form-item label="检测超时" :label-width="LABEL_W">
            <el-input v-model="form.checkTimeout" type="text" autocomplete="off" :disabled="fieldDisabled()">
              <template #append>
                ms
              </template>
            </el-input>
          </el-form-item>
        </el-col>
      </el-row>
    </el-form-item>

    <el-row :gutter="12" class="config-sections-row">
      <el-col :span="8">
        <fieldset class="config-section">
          <legend>补单配置</legend>
          <el-form-item label="是否补单:">
            <el-switch v-model="form.makeUp" :disabled="fieldDisabled()" />
          </el-form-item>
          <el-form-item v-if="form.makeUp" label="补单利润:">
            <el-input
              v-model="form.makeProfit"
              autocomplete="off"
              :disabled="fieldDisabled(!form.makeUp)"
            />
          </el-form-item>
          <template v-if="form.makeUp">
            <el-form-item label="初始赔率:" title="初赔大于此设定赔率不进行补单">
              <el-input
                v-model="form.makeUp_defaultOdds"
                autocomplete="off"
                :disabled="fieldDisabled(!form.makeUp)"
              />
            </el-form-item>
            <el-form-item label="当前赔率:" title="补单的赔率大于此设定值不进行补单">
              <el-input
                v-model="form.makeUp_odds"
                autocomplete="off"
                :disabled="fieldDisabled(!form.makeUp)"
              />
            </el-form-item>
          </template>
          <el-form-item>
            <el-switch
              v-model="form.noSameProvider"
              inline-prompt
              active-text="不补同场馆"
              inactive-text="不补同场馆"
              size="large"
              :disabled="fieldDisabled()"
            />
          </el-form-item>
          <el-form-item>
            <el-switch
              v-model="form.noSameBet"
              inline-prompt
              active-text="场管不对打"
              inactive-text="场管不对打"
              size="large"
              :disabled="fieldDisabled()"
            />
          </el-form-item>
          <el-form-item v-if="form.noSameBet" label="允许同场馆:">
            <el-select
              v-model="form.allowSameBet"
              multiple
              collapse-tags
              placeholder="noSameBet 时仍参与选腿的平台"
              style="width: 100%"
              :disabled="fieldDisabled()"
            >
              <el-option v-for="p in ALL_PLATFORMS" :key="p" :label="p" :value="p" />
            </el-select>
          </el-form-item>
          <el-form-item>
            <div class="any-odds-row">
              <el-tooltip
                effect="dark"
                content="1、下单失败用当前可投注的最高赔率继续投注。2、被拒单马上用最高赔率进行补单"
                placement="bottom"
              >
                <el-switch
                  v-model="form.anyOdds"
                  inline-prompt
                  active-text="任意赔率"
                  inactive-text="任意赔率"
                  size="large"
                  :disabled="fieldDisabled()"
                />
              </el-tooltip>
              <template v-if="form.anyOdds">
                <span class="any-odds-label">利润:</span>
                <el-input
                  v-model="form.anyOddsProfit"
                  autocomplete="off"
                  style="width: 80px"
                  :disabled="fieldDisabled(!form.anyOdds)"
                />
              </template>
            </div>
          </el-form-item>
        </fieldset>
      </el-col>

      <el-col :span="8">
        <fieldset class="config-section">
          <legend>投注顺序</legend>
          <el-form-item>
            <el-radio-group
              v-model="form.betSorting"
              size="large"
              class="bet-sorting-group"
              :disabled="fieldDisabled()"
            >
              <el-radio v-for="key in sortingKeys" :key="key" :value="key">
                {{ sortingLabels[key] }}
              </el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item v-if="form.betSorting === 'WinRate'" label="胜率差额:">
            <el-input
              v-model="form.winRateValue"
              autocomplete="off"
              :disabled="fieldDisabled(form.betSorting !== 'WinRate')"
            />
          </el-form-item>
          <el-form-item label="固定平台优先:">
            <el-select
              v-model="form.providerFixed"
              multiple
              collapse-tags
              placeholder="选中的平台在选腿时优先"
              style="width: 100%"
              :disabled="fieldDisabled()"
            >
              <el-option v-for="p in ALL_PLATFORMS" :key="`fixed-${p}`" :label="p" :value="p" />
            </el-select>
          </el-form-item>
          <el-form-item>
            <div class="provider-sort">
              <div
                v-for="(p, index) in form.providerSortValue"
                :key="p"
                class="drag-item"
                :class="{ 'drag-item--static': readonly }"
                :draggable="!readonly"
                @dragstart="onDragStart(index)"
                @dragenter="onDragEnter(index, $event)"
                @dragover="onDragOver"
              >
                {{ p }}
              </div>
            </div>
          </el-form-item>
        </fieldset>
      </el-col>

      <el-col :span="8">
        <fieldset class="config-section">
          <legend>拒单检测</legend>
          <template v-for="pair in platformPairs" :key="pair.join('-')">
            <el-row :gutter="8">
              <el-col v-for="p in pair" :key="p" :span="12">
                <el-form-item>
                  <el-input
                    :model-value="form.waitTime[p] ?? ''"
                    :disabled="fieldDisabled()"
                    @update:model-value="(v: string | number) => setWaitTime(p, v)"
                  >
                    <template #prepend>
                      {{ p }}
                    </template>
                  </el-input>
                </el-form-item>
              </el-col>
            </el-row>
          </template>
        </fieldset>
      </el-col>
    </el-row>

    <slot name="footer" />
  </el-form>
</template>

<style scoped>
.bet-money-row {
  display: flex;
  align-items: center;
  width: 100%;
}

.bet-money-row__input {
  flex-shrink: 0;
  margin-bottom: 0 !important;
}

.bet-money-row__switches {
  display: flex;
  gap: 20px;
  margin-left: 40px;
}

.any-odds-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.any-odds-label {
  font-size: 12px;
  color: var(--el-text-color-regular);
  white-space: nowrap;
}

.user-config-panel :deep(.el-form-item) {
  margin-bottom: 14px;
}

.user-config-panel :deep(.el-form-item__label) {
  font-size: 13px;
}

.config-sections-row {
  align-items: stretch;
}

.config-section {
  height: 100%;
  margin: 0;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  padding: 12px 14px 4px;
}

.config-section legend {
  padding: 2px 10px;
  font-size: 13px;
  font-weight: 600;
}

.config-section :deep(.el-form-item) {
  margin-bottom: 10px;
}

.config-section :deep(.el-form-item__label) {
  font-size: 12px;
}

.bet-sorting-group {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.provider-sort {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.drag-item {
  padding: 4px 10px;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  font-size: 12px;
  cursor: grab;
  user-select: none;
}

.drag-item--static {
  cursor: default;
}

.user-config-panel--readonly :deep(.el-input.is-disabled .el-input__inner),
.user-config-panel--readonly :deep(.el-input.is-disabled .el-input__wrapper) {
  cursor: default;
}
</style>
