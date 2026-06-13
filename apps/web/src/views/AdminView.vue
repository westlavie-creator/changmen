<script setup lang="ts">
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import AdminLayout from "@/components/admin/AdminLayout.vue";
import AdminPanel from "@/components/admin/AdminPanel.vue";
import { useUserStore } from "@/stores/userStore";

const router = useRouter();
const user = useUserStore();

onMounted(async () => {
  if (!user.ready) {
    try {
      await user.fetchUserInfo();
    } catch {
      sessionStorage.setItem("gamebet:postLoginRedirect", "/admin");
      await router.replace({ name: "home" });
      return;
    }
  }
  if (!user.isAdmin) {
    await router.replace({ name: "home" });
  }
});
</script>

<template>
  <AdminLayout title="管理概览">
    <AdminPanel />
  </AdminLayout>
</template>
