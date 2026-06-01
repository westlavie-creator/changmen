<script setup lang="ts">
import UserInfoPanel from "@/components/user/UserInfoPanel.vue";
import LoseOrderView from "@/components/order/LoseOrderView.vue";
import OrderView from "@/components/order/OrderView.vue";

defineEmits<{ logout: [] }>();
</script>

<template>
  <div class="app-sidebar">
    <UserInfoPanel @logout="$emit('logout')" />
    <OrderView />
    <LoseOrderView />
  </div>
</template>
