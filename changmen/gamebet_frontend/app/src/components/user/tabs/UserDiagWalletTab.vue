<script setup lang="ts">
import { onMounted, ref } from "vue";
import { getClientDataArray, saveClientData } from "@/api/esport";
import type { WalletRow } from "@/types/userExtras";

const rows = ref<WalletRow[]>([]);
const saving = ref(false);
const refreshing = ref(false);

async function load() {
  rows.value = await getClientDataArray<WalletRow>("Wallet");
}

async function persist() {
  saving.value = true;
  try {
    await saveClientData("Wallet", JSON.stringify(rows.value));
  } finally {
    saving.value = false;
  }
}

function createWallet(): WalletRow {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const key = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const address = `T${key.slice(0, 33).toUpperCase()}`;
  return { name: "", address, key, trx: 0, usdt: 0 };
}

async function addWallet() {
  rows.value.push(createWallet());
  await persist();
}

async function removeWallet(row: WalletRow) {
  if (!confirm("确认要删除钱包吗？删除之后不可恢复")) return;
  if ((row.usdt ?? 0) > 0.1) {
    window.alert("账户内还存在余额");
    return;
  }
  rows.value = rows.value.filter((w) => w.address !== row.address);
  await persist();
  window.alert("删除成功");
}

async function copyKey(key: string) {
  try {
    await navigator.clipboard.writeText(key);
    window.alert("私钥已复制到剪贴板");
  } catch {
    window.alert("复制失败");
  }
}

async function refreshBalances() {
  refreshing.value = true;
  try {
    window.alert("链上余额刷新需 Tron 节点支持，当前为本地占位");
  } finally {
    refreshing.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="diag-tab wallet-tab">
    <div class="wallet-head">
      <h4>波场钱包</h4>
      <div class="wallet-head__actions">
        <button type="button" class="save-btn" :disabled="saving" @click="addWallet">
          + 创建钱包
        </button>
        <button type="button" class="mini-btn" :disabled="refreshing" @click="refreshBalances">
          ↻ 刷新余额
        </button>
      </div>
    </div>

    <div v-for="row in rows" :key="row.address" class="wallet-card">
      <label class="wallet-field">
        <span>名称</span>
        <input v-model="row.name" type="text" @change="persist" />
      </label>
      <label class="wallet-field">
        <span>地址</span>
        <input :value="row.address" type="text" readonly />
      </label>
      <label class="wallet-field">
        <span>TRX</span>
        <input :value="row.trx ?? 0" type="text" disabled />
      </label>
      <label class="wallet-field">
        <span>USDT</span>
        <input :value="row.usdt ?? 0" type="text" disabled />
      </label>
      <div class="wallet-card__actions">
        <button type="button" class="mini-btn mini-btn--ok" title="复制私钥" @click="copyKey(row.key)">
          🔑
        </button>
        <button type="button" class="mini-btn mini-btn--danger" @click="removeWallet(row)">×</button>
      </div>
    </div>

    <p v-if="!rows.length" class="diag-tab__muted">暂无钱包，点击「创建钱包」添加</p>
  </div>
</template>

<style scoped>
.wallet-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.wallet-head h4 {
  margin: 0;
  font-size: 14px;
  color: #e2e8f0;
}
.wallet-head__actions {
  display: flex;
  gap: 8px;
}
.wallet-card {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 10px;
  margin-bottom: 10px;
  border: 1px solid #334155;
  border-radius: 6px;
  background: #0f172a60;
}
.wallet-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  color: #94a3b8;
}
.wallet-field input {
  padding: 6px 8px;
  border: 1px solid #475569;
  border-radius: 4px;
  background: #0f172a;
  color: #e2e8f0;
  font-size: 12px;
}
.wallet-field input:disabled,
.wallet-field input[readonly] {
  opacity: 0.85;
}
.wallet-card__actions {
  grid-column: span 2;
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}
.save-btn {
  padding: 6px 12px;
  background: #409eff;
  border: none;
  border-radius: 4px;
  color: #fff;
  cursor: pointer;
  font-size: 12px;
}
.mini-btn {
  padding: 4px 10px;
  border: 1px solid #475569;
  border-radius: 4px;
  background: #334155;
  color: #e2e8f0;
  cursor: pointer;
  font-size: 12px;
}
.mini-btn--ok {
  background: #065f46;
  border-color: #065f46;
}
.mini-btn--danger {
  color: #f87171;
}
.diag-tab__muted {
  color: #64748b;
  font-size: 13px;
}
</style>
