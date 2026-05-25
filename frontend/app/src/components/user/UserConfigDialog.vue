<script setup lang="ts">
import { reactive, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import AppDialog from "@/components/ui/AppDialog.vue";
import { useConfigStore } from "@/stores/configStore";
import { ALL_PLATFORMS, type BetSorting, type UserConfig } from "@/types/userConfig";
import type { PlatformId } from "@/types/esport";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

const configStore = useConfigStore();
const { config, saving } = storeToRefs(configStore);

const form = reactive(createFormFromConfig(configStore.config));
const autoOpenTime = ref("");
const dragIndex = ref(0);

const sortingOptions: { value: BetSorting; label: string }[] = [
  { value: "Custom", label: "自定义顺序" },
  { value: "Low", label: "低赔优先" },
  { value: "High", label: "高赔优先" },
  { value: "Parallel", label: "并行投注" },
  { value: "WinRate", label: "胜率优先" },
];

function createFormFromConfig(src: UserConfig) {
  return {
    ...src,
    providerSortValue: [...src.providerSortValue],
    providerFixed: [...src.providerFixed],
    waitTime: { ...src.waitTime },
  };
}

function syncAutoOpenTime(ms: number) {
  if (!ms) {
    autoOpenTime.value = "";
    return;
  }
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  autoOpenTime.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

watch(
  () => props.open,
  (v) => {
    if (!v) return;
    Object.assign(form, createFormFromConfig(config.value));
    syncAutoOpenTime(form.bettingAutoOpenTime);
  },
  { immediate: true },
);

watch(autoOpenTime, (v) => {
  form.bettingAutoOpenTime = v ? new Date(v).getTime() : 0;
});

function waitValue(platform: PlatformId) {
  return form.waitTime[platform] ?? 0;
}

function setWaitValue(platform: PlatformId, v: number) {
  form.waitTime[platform] = v;
}

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

function toggleProviderFixed(platform: PlatformId, checked: boolean) {
  if (checked) {
    if (!form.providerFixed.includes(platform)) {
      form.providerFixed.push(platform);
    }
  } else {
    form.providerFixed = form.providerFixed.filter((x) => x !== platform);
  }
}

async function save() {
  Object.assign(configStore.config, {
    ...form,
    providerSortValue: [...form.providerSortValue],
    providerFixed: [...form.providerFixed],
    waitTime: { ...form.waitTime },
  });
  const ok = await configStore.save();
  if (ok) emit("close");
}
</script>

<template>
  <AppDialog :open="open" title="参数配置" width="520px" @close="emit('close')">
    <div class="config-form">
      <fieldset class="config-block">
        <legend>投注</legend>
        <label class="config-row config-row--check">
          <input v-model="form.betting" type="checkbox" />
          <span>开启投注</span>
        </label>
        <template v-if="!form.betting">
          <label class="config-row config-row--check">
            <input v-model="form.bettingAutoOpen" type="checkbox" />
            <span>定时打开</span>
          </label>
          <label v-if="form.bettingAutoOpen" class="config-row">
            <span>开启时间</span>
            <input v-model="autoOpenTime" type="datetime-local" />
          </label>
        </template>
        <label class="config-row">
          <span>投注金额</span>
          <input v-model.number="form.betMoney" type="number" min="0" step="1" />
        </label>
        <label class="config-row">
          <span>最低投注</span>
          <input v-model.number="form.minMoney" type="number" min="0" step="1" />
        </label>
        <label class="config-row">
          <span>最高投注</span>
          <input v-model.number="form.maxMoney" type="number" min="0" step="1" />
        </label>
        <label class="config-row config-row--check">
          <input v-model="form.tenNumber" type="checkbox" />
          <span>十位取整</span>
        </label>
        <label class="config-row">
          <span>投注次数</span>
          <input v-model.number="form.betCount" type="number" min="0" step="1" />
        </label>
        <label class="config-row">
          <span>投注间隔 (秒)</span>
          <input v-model.number="form.betInterval" type="number" min="0" step="1" />
        </label>
        <label class="config-row config-row--check">
          <input v-model="form.betChecked" type="checkbox" />
          <span>投注前校验</span>
        </label>
      </fieldset>

      <fieldset class="config-block">
        <legend>利润 / 赔率</legend>
        <label class="config-row">
          <span>目标利润</span>
          <input v-model.number="form.profit" type="number" min="1" step="0.01" />
        </label>
        <label class="config-row">
          <span>最大利润</span>
          <input v-model.number="form.maxProfit" type="number" min="1" step="0.01" />
        </label>
        <label class="config-row">
          <span>最小赔率</span>
          <input v-model.number="form.minOdds" type="number" min="1" step="0.01" />
        </label>
        <label class="config-row">
          <span>最大赔率</span>
          <input v-model.number="form.maxOdds" type="number" min="1" step="0.01" />
        </label>
        <label class="config-row">
          <span>校验超时 (ms)</span>
          <input v-model.number="form.checkTimeout" type="number" min="500" step="100" />
        </label>
        <label class="config-row config-row--check">
          <input v-model="form.singleBet" type="checkbox" />
          <span>单场单注</span>
        </label>
      </fieldset>

      <fieldset class="config-block">
        <legend>补单</legend>
        <label class="config-row config-row--check">
          <input v-model="form.makeUp" type="checkbox" />
          <span>开启补单</span>
        </label>
        <label class="config-row">
          <span>补单利润</span>
          <input v-model.number="form.makeProfit" type="number" min="1" step="0.01" />
        </label>
        <label class="config-row">
          <span>补单赔率</span>
          <input v-model.number="form.makeUp_odds" type="number" min="0" step="0.01" />
        </label>
        <label class="config-row">
          <span>默认补单赔率</span>
          <input v-model.number="form.makeUp_defaultOdds" type="number" min="0" step="0.01" />
        </label>
        <label class="config-row config-row--check">
          <input v-model="form.noSameProvider" type="checkbox" />
          <span>禁止同平台对冲</span>
        </label>
        <label class="config-row config-row--check">
          <input v-model="form.noSameBet" type="checkbox" />
          <span>禁止同盘口重复</span>
        </label>
        <label class="config-row config-row--check">
          <input v-model="form.anyOdds" type="checkbox" />
          <span>任意赔率</span>
        </label>
        <label v-if="form.anyOdds" class="config-row">
          <span>任意赔率利润</span>
          <input v-model.number="form.anyOddsProfit" type="number" min="0" step="0.01" />
        </label>
      </fieldset>

      <fieldset class="config-block">
        <legend>投注顺序</legend>
        <label class="config-row">
          <span>排序策略</span>
          <select v-model="form.betSorting">
            <option v-for="o in sortingOptions" :key="o.value" :value="o.value">
              {{ o.label }}
            </option>
          </select>
        </label>
        <label v-if="form.betSorting === 'WinRate'" class="config-row">
          <span>胜率参数</span>
          <input v-model.number="form.winRateValue" type="number" min="0" max="1" step="0.01" />
        </label>
        <div class="provider-sort">
          <span class="provider-sort__label">场馆顺序（拖拽）</span>
          <ul class="provider-sort__list">
            <li
              v-for="(p, index) in form.providerSortValue"
              :key="p"
              draggable="true"
              class="provider-sort__item"
              @dragstart="onDragStart(index)"
              @dragenter="onDragEnter(index, $event)"
              @dragover.prevent
            >
              <span class="provider-icon" :class="p" />
              {{ p }}
            </li>
          </ul>
        </div>
        <div class="provider-fixed">
          <span class="provider-sort__label">固定场馆</span>
          <div class="provider-fixed__list">
            <label v-for="p in ALL_PLATFORMS" :key="p" class="provider-fixed__item">
              <input
                type="checkbox"
                :checked="form.providerFixed.includes(p)"
                @change="toggleProviderFixed(p, ($event.target as HTMLInputElement).checked)"
              />
              <span class="provider-icon" :class="p" />
              {{ p }}
            </label>
          </div>
        </div>
      </fieldset>

      <fieldset class="config-block">
        <legend>拒单检测 (秒)</legend>
        <label v-for="p in ALL_PLATFORMS" :key="p" class="config-row config-row--wait">
          <span>{{ p }}</span>
          <input
            :value="waitValue(p)"
            type="number"
            step="1"
            @input="setWaitValue(p, Number(($event.target as HTMLInputElement).value) || 0)"
          />
        </label>
      </fieldset>
    </div>

    <template #footer>
      <button type="button" class="btn btn--ghost" @click="emit('close')">取消</button>
      <button type="button" class="btn btn--primary" :disabled="saving" @click="save">
        {{ saving ? "保存中…" : "保存配置" }}
      </button>
    </template>
  </AppDialog>
</template>

<style scoped>
.config-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 65vh;
  overflow: auto;
  padding-right: 4px;
}
.config-block {
  border: 1px solid #475569;
  border-radius: 6px;
  padding: 10px 12px;
  margin: 0;
}
.config-block legend {
  padding: 0 6px;
  font-size: 12px;
  color: #94a3b8;
}
.config-row {
  display: grid;
  grid-template-columns: 110px 1fr;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  margin: 6px 0;
}
.config-row--check {
  grid-template-columns: auto 1fr;
}
.config-row--wait {
  grid-template-columns: 56px 1fr;
}
.config-row input[type="number"],
.config-row input[type="datetime-local"],
.config-row select {
  padding: 6px 8px;
  border: 1px solid #475569;
  border-radius: 4px;
  background: #0f172a;
  color: #e2e8f0;
}
.provider-sort__label {
  display: block;
  font-size: 12px;
  color: #94a3b8;
  margin: 8px 0 6px;
}
.provider-sort__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.provider-sort__item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 1px dashed #64748b;
  border-radius: 4px;
  font-size: 12px;
  cursor: grab;
  background: #0f172a;
}
.provider-sort__item .provider-icon {
  width: 14px;
  height: 14px;
}
.provider-fixed__list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.provider-fixed__item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  cursor: pointer;
}
.provider-fixed__item .provider-icon {
  width: 14px;
  height: 14px;
}
.btn {
  padding: 6px 14px;
  border-radius: 4px;
  border: 1px solid #475569;
  cursor: pointer;
  font-size: 13px;
}
.btn--ghost {
  background: transparent;
  color: #cbd5e1;
}
.btn--primary {
  background: #059669;
  border-color: #059669;
  color: #fff;
}
.btn--primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
