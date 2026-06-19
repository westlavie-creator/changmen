<script setup lang="ts">
import AccountCard from "@/components/account/AccountCard.vue";
import type { PlatformAccount } from "@/models/platformAccount";

defineProps<{
  accounts: PlatformAccount[];
}>();

const emit = defineEmits<{ edit: [account: PlatformAccount] }>();
</script>

<template>
  <div class="providers flex flex-wrap">
    <AccountCard
      v-for="acc in accounts"
      :key="acc.accountId"
      :account="acc"
      preview
      @edit="emit('edit', acc)"
    />
  </div>
</template>
