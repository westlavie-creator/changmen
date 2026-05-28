<script setup lang="ts">
import { ref } from "vue";
import { storeToRefs } from "pinia";
import AccountCard from "@/components/account/AccountCard.vue";
import AccountEditDialog from "@/components/account/AccountEditDialog.vue";
import MoneyLogDialog from "@/components/account/MoneyLogDialog.vue";
import type { PlatformAccount } from "@/models/platformAccount";
import { useAccountStore } from "@/stores/accountStore";

const accountStore = useAccountStore();
const { sortedAccounts, loading, editDialogOpen, editDialogAccount } = storeToRefs(accountStore);

const moneyOpen = ref(false);
const moneyAccountId = ref(0);

function openMoney(account: PlatformAccount) {
  moneyAccountId.value = account.accountId;
  moneyOpen.value = true;
}

async function refreshOne(account: PlatformAccount) {
  await accountStore.refreshBalance(account);
  await accountStore.saveAccounts();
}

async function removeAccount(account: PlatformAccount) {
  if (!confirm(`确认注销账号 ${account.playerName}？`)) return;
  await accountStore.deleteAccount(account.accountId);
}

async function refreshAll() {
  await accountStore.refreshAllBalances();
}
</script>

<template>
  <section class="account-bar">
    <div class="account-bar__head flex flex-between flex-middle">
      <strong>账号 ({{ sortedAccounts.length }})</strong>
      <div class="account-bar__actions flex flex-middle">
        <button type="button" class="bar-btn" :disabled="loading" @click="refreshAll">全部刷新</button>
        <button type="button" class="bar-btn bar-btn--primary" @click="accountStore.openCreateAccount()">
          添加账号
        </button>
      </div>
    </div>
    <div v-if="!sortedAccounts.length" class="account-bar__empty">暂无账号，点击「添加账号」或左上角 + 创建</div>
    <div v-else class="providers flex flex-wrap account-bar__list">
      <AccountCard
        v-for="acc in sortedAccounts"
        :key="acc.accountId"
        :account="acc"
        @refresh="refreshOne(acc)"
        @edit="accountStore.openEditAccount(acc)"
        @money="openMoney(acc)"
        @remove="removeAccount(acc)"
      />
    </div>

    <AccountEditDialog
      :open="editDialogOpen"
      :account="editDialogAccount"
      @close="accountStore.closeAccountDialog()"
    />
    <MoneyLogDialog
      :open="moneyOpen"
      :account-id="moneyAccountId"
      @close="moneyOpen = false"
    />
  </section>
</template>

<style scoped>
.account-bar {
  border-bottom: 1px solid #ffffff1a;
  background: #00000040;
  padding: 8px 12px 10px;
}
.account-bar__head {
  margin-bottom: 8px;
  color: #e2e8f0;
  font-size: 13px;
}
.account-bar__actions {
  gap: 8px;
}
.bar-btn {
  padding: 4px 10px;
  border-radius: 4px;
  border: 1px solid #475569;
  background: transparent;
  color: #cbd5e1;
  font-size: 12px;
  cursor: pointer;
}
.bar-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.bar-btn--primary {
  background: #059669;
  border-color: #059669;
  color: #fff;
}
.account-bar__empty {
  color: #64748b;
  font-size: 12px;
  padding: 8px 0;
}
.account-bar__list {
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
}
</style>
