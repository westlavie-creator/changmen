<script setup lang="ts">
import GalaxySpinner from "@/components/layout/GalaxySpinner.vue";

defineProps<{
  showLogin?: boolean;
}>();
</script>

<template>
  <GalaxySpinner v-if="!showLogin" />
  <div v-else class="login-page container flex flex-middle flex-column">
    <div class="slogo" />
    <div class="loginbox">
      <slot />
    </div>
  </div>
</template>
