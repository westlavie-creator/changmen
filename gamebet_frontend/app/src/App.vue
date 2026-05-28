<script setup lang="ts">
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import { useUserStore } from "@/stores/userStore";

const router = useRouter();
const user = useUserStore();

onMounted(async () => {
  const ok = await user.restoreSession();
  if (!ok && router.currentRoute.value.name !== "login") {
    await router.replace({ name: "login" });
  }
});
</script>

<template>
  <router-view />
</template>
