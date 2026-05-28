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
  <el-form>
    <fieldset>
      <legend>平台</legend>
      <el-radio-group v-model="provider">
        <el-radio v-for="p in ALL_PLATFORMS" :key="p" :value="p">
          <span class="provider-icon" :class="p" />
          {{ p }}
        </el-radio>
      </el-radio-group>
    </fieldset>

    <p v-if="!filtered.length" class="trade-empty">当前平台暂无账号</p>

    <fieldset v-for="acc in filtered" :key="acc.accountId" class="trade-card">
      <legend class="trade-legend">
        {{ acc.platformName }} / {{ acc.playerName }}
        <span v-if="acc.balance != null"> / {{ acc.balance.toFixed(0) }}</span>
        <el-button link type="primary" class="am-icon-refresh" @click="refreshAccount(acc)" />
      </legend>
      <el-row :gutter="10">
        <el-col :span="8">
          <el-form-item label="暂停">
            <el-switch v-model="acc.pause" @change="patchAccount(acc, 'pause')" />
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="上次投注">
            <el-switch v-model="acc.lastOdds" @change="patchAccount(acc, 'lastOdds')" />
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="profit">
            <el-input
              v-model.number="acc.profit"
              type="number"
              step="0.01"
              @change="patchAccount(acc, 'profit')"
            />
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="minOdds">
            <el-input
              v-model.number="acc.minOdds"
              type="number"
              step="0.01"
              @change="patchAccount(acc, 'minOdds')"
            />
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="maxOdds">
            <el-input
              v-model.number="acc.maxOdds"
              type="number"
              step="0.01"
              @change="patchAccount(acc, 'maxOdds')"
            />
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="multiply">
            <el-input
              v-model.number="acc.multiply"
              type="number"
              step="0.1"
              @change="patchAccount(acc, 'multiply')"
            />
          </el-form-item>
        </el-col>
      </el-row>
    </fieldset>
  </el-form>
</template>

<style scoped>
.trade-empty {
  margin: 8px 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.trade-legend {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.trade-card {
  margin-top: 10px;
}
</style>
