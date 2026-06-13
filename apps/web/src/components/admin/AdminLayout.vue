<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useUserStore } from "@/stores/userStore";

defineProps<{
  title?: string;
}>();

const route = useRoute();
const router = useRouter();
const user = useUserStore();

const tabs = [
  { name: "admin", label: "概览", to: { name: "admin" as const } },
  { name: "admin-users", label: "用户管理", to: { name: "admin-users" as const } },
  { name: "admin-orders", label: "订单", to: { name: "admin-orders" as const } },
];

const activeTab = computed(() => String(route.name || ""));

async function logout() {
  await user.logout();
  await router.push({ name: "login" });
}
</script>

<template>
  <div class="admin-page">
    <header class="admin-page__header">
      <div class="admin-page__nav">
        <el-button size="small" @click="router.push({ name: 'home' })">← 返回主页</el-button>
        <h1 class="admin-page__title">{{ title || "管理系统" }}</h1>
      </div>
      <div class="admin-page__user">
        <span class="admin-page__user-name">{{ user.userName }}</span>
        <el-button size="small" type="info" @click="logout">退出</el-button>
      </div>
    </header>
    <nav class="admin-nav">
      <router-link
        v-for="tab in tabs"
        :key="tab.name"
        :to="tab.to"
        class="admin-nav__item"
        :class="{ 'admin-nav__item--active': activeTab === tab.name }"
      >
        {{ tab.label }}
      </router-link>
    </nav>
    <main class="admin-page__main">
      <slot />
    </main>
  </div>
</template>
