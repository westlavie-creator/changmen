<script setup lang="ts">
import UserInfoPanel from "@/components/user/UserInfoPanel.vue";
import OrderView from "@/components/order/OrderView.vue";

withDefaults(
  defineProps<{
    embedded?: boolean;
    embeddedUserId?: string;
    embeddedUserName?: string;
    showFootballSettings?: boolean;
  }>(),
  { embedded: false, showFootballSettings: false },
);

defineEmits<{ logout: []; viewOrders: []; openFootballSettings: [] }>();
</script>

<template>
  <div class="app-sidebar">
    <UserInfoPanel
      :embedded="embedded"
      :embedded-user-name="embeddedUserName"
      :show-football-settings="showFootballSettings"
      @logout="$emit('logout')"
      @view-orders="$emit('viewOrders')"
      @open-football-settings="$emit('openFootballSettings')"
    />
    <OrderView :embedded="embedded" :embedded-user-id="embeddedUserId" />
  </div>
</template>
