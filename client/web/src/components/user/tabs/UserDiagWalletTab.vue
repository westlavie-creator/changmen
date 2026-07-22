<script setup lang="ts">
import type { WalletRow } from "@/types/userExtras";
import { ElMessage } from "element-plus";
import { onMounted, ref } from "vue";
import { getClientDataArray, saveClientData } from "@/api/esport";
import { fetchTronBalances, generateTronWallet } from "@/shared/tronWallet";

const rows = ref<WalletRow[]>([]);
const saving = ref(false);
const refreshing = ref(false);

async function load() {
  try {
    rows.value = await getClientDataArray<WalletRow>("Wallet");
  }
  catch {
    rows.value = [];
  }
}

async function persist() {
  saving.value = true;
  try {
    await saveClientData("Wallet", JSON.stringify(rows.value));
  }
  finally {
    saving.value = false;
  }
}

async function addWallet() {
  const { address, key } = await generateTronWallet();
  rows.value.push({ name: "", address, key, trx: 0, usdt: 0 });
  await persist();
}

async function removeWallet(row: WalletRow) {
  if (!confirm("确认要删除钱包吗？删除之后不可恢复"))
    return;
  if ((row.usdt ?? 0) > 0.1) {
    ElMessage.error("账户内还存在余额");
    return;
  }
  rows.value = rows.value.filter(w => w.address !== row.address);
  await persist();
  ElMessage.success("删除成功");
}

async function copyKey(key: string) {
  try {
    await navigator.clipboard.writeText(key);
    ElMessage.info("私钥已复制到剪贴板");
  }
  catch {
    ElMessage.error("复制失败");
  }
}

async function refreshBalances() {
  if (!rows.value.length)
    return;
  refreshing.value = true;
  try {
    for (const row of rows.value) {
      if (!row.address)
        continue;
      try {
        const { trx, usdt } = await fetchTronBalances(row.address);
        row.trx = trx;
        row.usdt = usdt;
      }
      catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn("[Wallet] balance", row.address, msg);
      }
    }
    await persist();
    ElMessage.success("余额已刷新");
  }
  finally {
    refreshing.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="header flex flex-between">
    <div class="tit">
      <el-text size="large">
        波场钱包
      </el-text>
    </div>
    <div class="action">
      <el-button-group>
        <el-button type="primary" @click="addWallet">
          <i class="am-icon-plus" />&nbsp;创建钱包
        </el-button>
        <el-button :loading="refreshing" @click="refreshBalances">
          <i class="am-icon-refresh" />&nbsp;刷新余额
        </el-button>
      </el-button-group>
    </div>
  </div>

  <el-form :disabled="saving" class="wallets flex flex-column">
    <div v-for="row in rows" :key="row.address" class="wallet flex flex-middle">
      <div class="name">
        <el-input v-model="row.name" @change="persist">
          <template #prepend>
            名称
          </template>
        </el-input>
      </div>
      <div class="address flex-1">
        <el-input :model-value="row.address" readonly>
          <template #prepend>
            地址
          </template>
        </el-input>
      </div>
      <div class="balance trx">
        <el-input :model-value="row.trx ?? 0" disabled>
          <template #prepend>
            TRX
          </template>
        </el-input>
      </div>
      <div class="balance usdt">
        <el-input :model-value="row.usdt ?? 0" disabled>
          <template #prepend>
            USDT
          </template>
        </el-input>
      </div>
      <div class="action">
        <el-button-group size="small">
          <el-button type="success" class="am-icon-key" @click="copyKey(row.key)" />
          <el-button type="danger" class="am-icon-times" @click="removeWallet(row)" />
        </el-button-group>
      </div>
    </div>
  </el-form>
</template>
