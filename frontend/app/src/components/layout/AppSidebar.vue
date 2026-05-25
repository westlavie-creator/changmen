<script setup lang="ts">
import UserInfoPanel from "@/components/user/UserInfoPanel.vue";
import CollectConfigPanel from "@/components/user/CollectConfigPanel.vue";
import LoseOrderView from "@/components/order/LoseOrderView.vue";
import OrderView from "@/components/order/OrderView.vue";

defineEmits<{ logout: [] }>();
</script>

<template>
  <aside class="app-sidebar">
    <UserInfoPanel @logout="$emit('logout')" />
    <LoseOrderView />
    <OrderView />
    <CollectConfigPanel />
    <section class="sidebar-panel sidebar-panel--muted">
      <h3>对照</h3>
      <a class="green" href="/console/" target="_blank" rel="noopener">旧版 /console/</a>
    </section>
  </aside>
</template>

<style scoped>
.app-sidebar {
  width: 260px;
  min-width: 260px;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #ffffff1a;
  background: #00000059;
  color: #cbd5e1;
  font-size: 13px;
}
.sidebar-panel {
  padding: 12px 14px;
  border-bottom: 1px solid #ffffff14;
  flex-shrink: 0;
}
.sidebar-panel h3 {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: #e2e8f0;
}
.sidebar-panel--muted a {
  font-size: 13px;
}
</style>
