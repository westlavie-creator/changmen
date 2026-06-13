<script setup lang="ts">
import { onMounted } from "vue";
import { useUserStore } from "@/stores/userStore";

const user = useUserStore();

onMounted(async () => {
  await user.restoreSession();
});
</script>

<template>
  <router-view />
</template>
