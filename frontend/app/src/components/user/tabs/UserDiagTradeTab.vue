<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { useAccountStore } from "@/stores/accountStore";
import { ALL_PLATFORMS } from "@/types/userConfig";
import type { PlatformId } from "@/types/esport";
import type { PlatformAccount } from "@/models/platformAccount";

const accountStore = useAccountStore();
const { sortedAccounts } = storeToRefs(accountStore);

const provider = ref<PlatformId>("OB");

const filtered = computed(() =>
  sortedAccounts.value.filter((a) => a.provider === provider.value),
);

onMounted(() => {
  if (!sortedAccounts.value.length) void accountStore.loadAccounts();
});

async function patchAccount(_acc: PlatformAccount, _field: keyof PlatformAccount) {
  await accountStore.saveAccounts();
}

async function refreshAccount(acc: PlatformAccount) {
  await accountStore.refreshBalance(acc);
  await accountStore.saveAccounts();
}
</script>

<template>
  <div class="trade-tab">
    <fieldset class="trade-block">
      <legend>平台</legend>
      <div class="provider-radios">
        <label v-for="p in ALL_PLATFORMS" :key="p" class="provider-radio">
          <input v-model="provider" type="radio" name="trade-provider" :value="p" />
          <span class="provider-icon" :class="p" />
          {{ p }}
        </label>
      </div>
    </fieldset>

    <p v-if="!filtered.length" class="trade-empty">当前平台暂无账号（本地操盘视图）</p>

    <div v-for="acc in filtered" :key="acc.accountId" class="trade-card">
      <fieldset>
        <legend class="trade-legend">
          [本地] {{ acc.platformName }} / {{ acc.playerName }}
          <span v-if="acc.balance != null"> / {{ acc.balance.toFixed(0) }}</span>
          <button type="button" class="icon-link" title="刷新" @click="refreshAccount(acc)">↻</button>
        </legend>
        <div class="trade-grid">
          <label class="switch-row">
            <input v-model="acc.pause" type="checkbox" @change="patchAccount(acc, 'pause')" />
            <span>暂停</span>
          </label>
          <label class="switch-row">
            <input
              v-model="acc.lastOdds"
              type="checkbox"
              @change="patchAccount(acc, 'lastOdds')"
            />
            <span>上次投注</span>
          </label>
          <label class="field-row">
            <span>profit</span>
            <input
              v-model.number="acc.profit"
              type="number"
              step="0.01"
              @change="patchAccount(acc, 'profit')"
            />
          </label>
          <label class="field-row">
            <span>minOdds</span>
            <input
              v-model.number="acc.minOdds"
              type="number"
              step="0.01"
              @change="patchAccount(acc, 'minOdds')"
            />
          </label>
          <label class="field-row">
            <span>maxOdds</span>
            <input
              v-model.number="acc.maxOdds"
              type="number"
              step="0.01"
              @change="patchAccount(acc, 'maxOdds')"
            />
          </label>
          <label class="field-row">
            <span>multiply</span>
            <input
              v-model.number="acc.multiply"
              type="number"
              step="0.1"
              @change="patchAccount(acc, 'multiply')"
            />
          </label>
        </div>
      </fieldset>
    </div>

    <p class="trade-hint">
      完整远程操盘需浏览器插件 WebSocket；此处为本地账号 pause / 赔率参数快捷调整。
    </p>
  </div>
</template>

<style scoped>
.trade-tab {
  font-size: 13px;
}
.trade-block {
  border: 1px solid #475569;
  border-radius: 6px;
  padding: 8px 10px;
  margin: 0 0 12px;
}
.trade-block legend {
  font-size: 12px;
  color: #94a3b8;
  padding: 0 4px;
}
.provider-radios {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.provider-radio {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  font-size: 12px;
}
.provider-radio .provider-icon {
  width: 14px;
  height: 14px;
}
.trade-card {
  margin-bottom: 10px;
}
.trade-card fieldset {
  border: 1px solid #334155;
  border-radius: 6px;
  padding: 8px 10px;
  margin: 0;
}
.trade-legend {
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.icon-link {
  border: none;
  background: none;
  color: #38bdf8;
  cursor: pointer;
  padding: 0;
}
.trade-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 8px;
}
.switch-row,
.field-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  color: #94a3b8;
}
.field-row input {
  padding: 4px 6px;
  border: 1px solid #475569;
  border-radius: 4px;
  background: #0f172a;
  color: #e2e8f0;
}
.trade-empty,
.trade-hint {
  color: #64748b;
  font-size: 12px;
  margin: 8px 0 0;
}
</style>
