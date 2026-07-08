<script setup lang="ts">
import UserInfoPanel from "@/components/user/UserInfoPanel.vue";
import OrderView from "@/components/order/OrderView.vue";

withDefaults(
  defineProps<{
    embedded?: boolean;
    embeddedUserId?: string;
    embeddedUserName?: string;
  }>(),
  { embedded: false },
);

defineEmits<{ logout: []; viewOrders: [] }>();
</script>

<template>
  <div class="app-sidebar">
    <UserInfoPanel
      :embedded="embedded"
      :embedded-user-name="embeddedUserName"
      @logout="$emit('logout')"
      @view-orders="$emit('viewOrders')"
    />
    <OrderView :embedded="embedded" :embedded-user-id="embeddedUserId" />
  </div>
</template>
