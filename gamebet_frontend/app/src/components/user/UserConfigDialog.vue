<script setup lang="ts">
/**
 * 对齐 console bundle `UserConfigView`（EDe）+ 侧栏 `el-dialog` 参数配置。
 * 样式来自 `a8.css`（与 `/console/` 同源），组件使用 Element Plus。
 */
import { computed, onMounted, reactive, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import { storeToRefs } from "pinia";
import { useConfigStore } from "@/stores/configStore";
import { useUserStore } from "@/stores/userStore";
import { ALL_PLATFORMS, type BetSorting, type UserConfig } from "@/types/userConfig";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

const LABEL_W = "80px";
const configStore = useConfigStore();
const userStore = useUserStore();
const { saving } = storeToRefs(configStore);

const form = reactive(createFormFromConfig(configStore.config));
const autoOpenDate = ref<Date | null>(null);
const dragIndex = ref(0);

const sortingLabels: Record<BetSorting, string> = {
  Low: "低赔优先",
  High: "高赔优先",
  Parallel: "并行投注",
  WinRate: "胜率优先",
  Custom: "自定义顺序",
};

const sortingKeys = Object.keys(sortingLabels) as BetSorting[];

const visible = computed({
  get: () => props.open,
  set: (v: boolean) => {
    if (!v) emit("close");
  },
});

function createFormFromConfig(src: UserConfig) {
  return {
    ...src,
    providerSortValue: [...src.providerSortValue],
    providerFixed: [...src.providerFixed],
    waitTime: { ...src.waitTime },
  };
}

function syncFormFromStore() {
  Object.assign(form, createFormFromConfig(configStore.config));
  autoOpenDate.value = form.bettingAutoOpenTime ? new Date(form.bettingAutoOpenTime) : null;
}

watch(autoOpenDate, (v) => {
  form.bettingAutoOpenTime = v ? v.getTime() : 0;
});

watch(
  () => props.open,
  (v) => {
    if (v) syncFormFromStore();
  },
);

onMounted(async () => {
  if (!configStore.loaded) await configStore.load();
  syncFormFromStore();
});

function onDragStart(index: number) {
  dragIndex.value = index;
}

function onDragEnter(index: number, e: DragEvent) {
  e.preventDefault();
  if (dragIndex.value === index) return;
  const moved = form.providerSortValue[dragIndex.value];
  form.providerSortValue.splice(dragIndex.value, 1);
  form.providerSortValue.splice(index, 0, moved);
  dragIndex.value = index;
}

function onDragOver(e: DragEvent) {
  e.preventDefault();
}

async function save() {
  Object.assign(configStore.config, {
    ...form,
    profit: Number(form.profit),
    maxProfit: Number(form.maxProfit) || 1.1,
    makeProfit: Number(form.makeProfit) || 1.01,
    betMoney: Number(form.betMoney) || 100,
    minMoney: Number(form.minMoney) || 0,
    maxMoney: Number(form.maxMoney) || 0,
    minOdds: Number(form.minOdds) || 0,
    anyOddsProfit: Number(form.anyOddsProfit) || 0.95,
    providerSortValue: [...form.providerSortValue],
    providerFixed: [...form.providerFixed],
    waitTime: { ...form.waitTime },
  });
  try {
    const ok = await configStore.save();
    if (ok) ElMessage.success("保存成功");
  } finally {
    emit("close");
    await userStore.fetchUserInfo();
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    title="参数配置"
    width="420"
    :close-on-press-escape="false"
    :close-on-click-modal="false"
    class="user-config-dialog"
  >
    <el-form :model="form">
      <el-form-item>
        <el-row>
          <el-col :span="10">
            <el-form-item label="投注金额:" :label-width="LABEL_W">
              <el-input v-model="form.betMoney" autocomplete="off" />
            </el-form-item>
          </el-col>
          <el-col :span="1" />
          <el-col :span="5">
            <el-switch
              v-model="form.tenNumber"
              inline-prompt
              active-text="十位取整"
              inactive-text="十位取整"
              size="large"
            />
          </el-col>
          <el-col :span="1" />
          <el-col :span="6">
            <el-switch
              v-model="form.betting"
              inline-prompt
              active-text="开启投注"
              inactive-text="开启投注"
              size="large"
            />
          </el-col>
        </el-row>
      </el-form-item>

      <el-form-item v-if="!form.betting">
        <el-row>
          <el-col :span="6">
            <el-switch
              v-model="form.bettingAutoOpen"
              inline-prompt
              active-text="定时打开"
              inactive-text="定时打开"
              size="large"
            />
          </el-col>
          <el-col v-if="form.bettingAutoOpen" :span="18">
            <el-form-item label="开启时间:" :label-width="LABEL_W">
              <el-date-picker
                v-model="autoOpenDate"
                type="datetime"
                placeholder="Select date and time"
              />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form-item>

      <el-form-item>
        <el-row>
          <el-col :span="10">
            <el-form-item label="最低投注:" :label-width="LABEL_W">
              <el-input v-model="form.minMoney" autocomplete="off" />
            </el-form-item>
          </el-col>
          <el-col :span="10">
            <el-form-item label="最高投注:" :label-width="LABEL_W">
              <el-input v-model="form.maxMoney" autocomplete="off" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form-item>

      <el-form-item>
        <el-row>
          <el-col :span="10">
            <el-form-item label="投注次数" :label-width="LABEL_W">
              <el-input v-model="form.betCount" autocomplete="off" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="投注间隔" :label-width="LABEL_W">
              <el-input v-model="form.betInterval" autocomplete="off">
                <template #append>秒</template>
              </el-input>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form-item>

      <el-form-item label="利润要求" :label-width="LABEL_W">
        <el-row>
          <el-col :span="6">
            <el-input v-model="form.profit" type="number" autocomplete="off" />
          </el-col>
          <el-col :span="2" style="text-align: center">
            <span class="text-gray-500">-</span>
          </el-col>
          <el-col :span="6">
            <el-input v-model="form.maxProfit" type="number" autocomplete="off" />
          </el-col>
        </el-row>
      </el-form-item>

      <el-form-item>
        <el-row>
          <el-col :span="10">
            <el-form-item label="最低赔率" :label-width="LABEL_W">
              <el-input v-model="form.minOdds" autocomplete="off" />
            </el-form-item>
          </el-col>
          <el-col :span="14">
            <el-form-item label="检测超时" :label-width="LABEL_W">
              <el-input v-model="form.checkTimeout" autocomplete="off">
                <template #append>ms</template>
              </el-input>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form-item>

      <fieldset>
        <legend>补单配置</legend>
        <el-form-item>
          <el-row :gutter="10">
            <el-col :span="8">
              <el-form-item label="是否补单:">
                <el-switch v-model="form.makeUp" />
              </el-form-item>
            </el-col>
            <el-col v-if="form.makeUp" :span="10">
              <el-form-item label="补单利润:">
                <el-input v-model="form.makeProfit" autocomplete="off" :disabled="!form.makeUp" />
              </el-form-item>
            </el-col>
          </el-row>
        </el-form-item>
        <el-form-item v-if="form.makeUp">
          <el-row :gutter="10">
            <el-col :span="10">
              <el-form-item label="初始赔率:" title="初赔大于此设定赔率不进行补单">
                <el-input
                  v-model="form.makeUp_defaultOdds"
                  autocomplete="off"
                  :disabled="!form.makeUp"
                />
              </el-form-item>
            </el-col>
            <el-col :span="10">
              <el-form-item label="当前赔率:" title="补单的赔率大于此设定值不进行补单">
                <el-input v-model="form.makeUp_odds" autocomplete="off" :disabled="!form.makeUp" />
              </el-form-item>
            </el-col>
          </el-row>
        </el-form-item>
        <el-form-item>
          <el-row>
            <el-col :span="1" />
            <el-col :span="8">
              <el-switch
                v-model="form.noSameProvider"
                inline-prompt
                active-text="不补同场馆"
                inactive-text="不补同场馆"
                size="large"
              />
            </el-col>
            <el-col :span="8">
              <el-switch
                v-model="form.noSameBet"
                inline-prompt
                active-text="场管不对打"
                inactive-text="场管不对打"
                size="large"
              />
            </el-col>
            <el-col :span="7">
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
                />
              </el-tooltip>
            </el-col>
            <el-col :span="1" />
            <el-col v-if="form.anyOdds" :span="12">
              <el-form-item label="任意赔率利润要求:">
                <el-input
                  v-model="form.anyOddsProfit"
                  autocomplete="off"
                  :disabled="!form.anyOdds"
                />
              </el-form-item>
            </el-col>
          </el-row>
        </el-form-item>
      </fieldset>

      <fieldset>
        <legend>投注顺序</legend>
        <el-form-item>
          <el-radio-group v-model="form.betSorting" size="large">
            <el-radio v-for="key in sortingKeys" :key="key" :value="key">
              {{ sortingLabels[key] }}
            </el-radio>
          </el-radio-group>
        </el-form-item>
        <el-row>
          <el-col v-if="form.betSorting === 'WinRate'" :span="8">
            <el-form-item label="胜率差额:">
              <el-input
                v-model="form.winRateValue"
                autocomplete="off"
                :disabled="form.betSorting !== 'WinRate'"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item>
          <TransitionGroup name="drag" tag="div" class="provider-sort">
            <div
              v-for="(p, index) in form.providerSortValue"
              :key="p"
              class="drag-item"
              draggable="true"
              @dragstart="onDragStart(index)"
              @dragenter="onDragEnter(index, $event)"
              @dragover="onDragOver"
            >
              {{ p }}
            </div>
          </TransitionGroup>
        </el-form-item>
      </fieldset>

      <fieldset>
        <legend>拒单检测</legend>
        <el-row :gutter="10">
          <el-col v-for="p in ALL_PLATFORMS" :key="p" :span="8">
            <el-input
              :model-value="form.waitTime[p] ?? ''"
              @update:model-value="(v: string | number) => (form.waitTime[p] = Number(v) || 0)"
            >
              <template #prepend>{{ p }}</template>
            </el-input>
          </el-col>
        </el-row>
      </fieldset>

      <div class="flex flex-center submit">
        <el-button
          size="large"
          type="primary"
          class="am-icon-save"
          :loading="saving"
          round
          style="width: 100%"
          @click="save"
        >
          &nbsp;保存配置
        </el-button>
      </div>
    </el-form>
  </el-dialog>
</template>

<style scoped>
.user-config-dialog :deep(.el-dialog__body) {
  padding-top: 10px;
}
.text-gray-500 {
  color: #909399;
}
.submit {
  margin-top: 8px;
}
</style>
