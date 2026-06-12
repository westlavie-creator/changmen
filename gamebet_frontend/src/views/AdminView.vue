<script setup lang="ts">
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import AdminPanel from "@/components/admin/AdminPanel.vue";
import { useUserStore } from "@/stores/userStore";

const router = useRouter();
const user = useUserStore();

onMounted(async () => {
  if (!user.ready) {
    try {
      await user.fetchUserInfo();
    } catch {
      await router.replace({ name: "login", query: { redirect: "/admin" } });
      return;
    }
  }
  if (!user.isAdmin) {
    await router.replace({ name: "home" });
  }
});

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
        <h1 class="admin-page__title">管理系统</h1>
      </div>
      <div class="admin-page__user">
        <span class="admin-page__user-name">{{ user.userName }}</span>
        <el-button size="small" type="info" @click="logout">退出</el-button>
      </div>
    </header>
    <main class="admin-page__main">
      <AdminPanel />
    </main>
  </div>
</template>
