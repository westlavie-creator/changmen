<script setup lang="ts">
import GalaxySpinner from "@/components/layout/GalaxySpinner.vue";

defineProps<{
  showLogin?: boolean;
}>();
</script>

<template>
  <div class="plugin-intro-shell">
    <GalaxySpinner v-if="!showLogin" />
    <div v-else class="login-page container flex flex-middle flex-center">
      <div class="login-stage flex flex-middle flex-center">
        <img
          class="login-hero login-hero--left"
          src="/login/nagato.png"
          alt="长门"
          decoding="async"
        />
        <div class="login-center flex flex-column flex-middle">
          <img
            class="login-akatsuki"
            src="/login/akatsuki.png"
            alt="晓组织"
            decoding="async"
          />
          <div class="loginbox">
            <slot />
          </div>
        </div>
        <img
          class="login-hero login-hero--right"
          src="/login/kakashi.png"
          alt="卡卡西"
          decoding="async"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.plugin-intro-shell {
  width: 100%;
  height: 100%;
  min-height: 100%;
}
</style>
