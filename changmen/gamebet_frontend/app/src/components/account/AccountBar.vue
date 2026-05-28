<script setup lang="ts">
import { ref } from "vue";
import { storeToRefs } from "pinia";
import AccountCard from "@/components/account/AccountCard.vue";
import AccountEditDialog from "@/components/account/AccountEditDialog.vue";
import MoneyLogDialog from "@/components/account/MoneyLogDialog.vue";
import type { PlatformAccount } from "@/models/platformAccount";
import { useAccountStore } from "@/stores/accountStore";

/** 对齐 bundle AccountView：顶栏仅 providers 横排账号卡 */
const accountStore = useAccountStore();
const { sortedAccounts, editDialogOpen, editDialogAccount } = storeToRefs(accountStore);

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
</script>

<template>
  <div class="providers flex flex-wrap">
    <AccountCard
      v-for="acc in sortedAccounts"
      :key="acc.accountId"
      :account="acc"
      @refresh="refreshOne(acc)"
      @edit="accountStore.openEditAccount(acc)"
      @money="openMoney(acc)"
      @remove="removeAccount(acc)"
    />

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
  </div>
</template>
