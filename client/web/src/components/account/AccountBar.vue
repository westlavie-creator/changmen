<script setup lang="ts">
import type { PlatformAccount } from "@/models/platformAccount";
import { storeToRefs } from "pinia";
import { ref } from "vue";
import AccountCard from "@/components/account/AccountCard.vue";
import MoneyLogDialog from "@/components/account/MoneyLogDialog.vue";
import { useAccountStore } from "@/stores/accountStore";

/** 对齐 bundle AccountView：顶栏仅 providers 横排账号卡 */
withDefaults(
  defineProps<{
    embedded?: boolean;
  }>(),
  { embedded: false },
);

const accountStore = useAccountStore();
const { sortedAccounts } = storeToRefs(accountStore);

const moneyOpen = ref(false);
const moneyAccountId = ref(0);

function openMoney(account: PlatformAccount) {
  moneyAccountId.value = account.accountId;
  moneyOpen.value = true;
}

async function refreshOne(account: PlatformAccount) {
  await account.updateBalance();
  await account.updateOrders();
}

async function removeAccount(account: PlatformAccount) {
  await accountStore.deleteAccount(account.accountId);
}
</script>

<template>
  <div class="providers flex flex-wrap">
    <AccountCard
      v-for="acc in sortedAccounts"
      :key="acc.accountId"
      :account="acc"
      :preview="embedded"
      @refresh="refreshOne(acc)"
      @edit="accountStore.openEditAccount(acc)"
      @money="openMoney(acc)"
      @remove="removeAccount(acc)"
    />

    <MoneyLogDialog
      v-if="!embedded"
      :open="moneyOpen"
      :account-id="moneyAccountId"
      @close="moneyOpen = false"
    />
  </div>
</template>
