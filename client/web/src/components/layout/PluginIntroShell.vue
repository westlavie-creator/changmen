<script setup lang="ts">
import { defineAsyncComponent } from "vue";

const LoginStarfield = defineAsyncComponent(() => import("@/components/layout/LoginStarfield.vue"));

defineProps<{
  showLogin?: boolean;
  showComingSoon?: boolean;
}>();
</script>

<template>
  <div class="plugin-intro-shell">
    <div class="login-page login-page--betmoar container flex flex-middle flex-center">
      <LoginStarfield />
      <div class="login-stage login-stage--hero flex flex-column flex-middle flex-center">
        <p class="login-brand hero-word hero-word-0" aria-hidden="true">
          じらいや
        </p>
        <h1 class="login-hero-title" aria-label="Bet Bigger. Faster. Smarter.">
          <span class="hero-word hero-word-1">Bet</span>
          <span class="hero-word hero-word-2">Bigger.</span>
          <span class="hero-word hero-word-3">Faster.</span>
          <span class="hero-word hero-word-4 hero-word--accent">Smarter.</span>
        </h1>
        <template v-if="showLogin">
          <div class="login-center login-center--enter flex flex-column flex-middle">
            <div class="loginbox">
              <slot />
            </div>
          </div>
        </template>
        <p
          v-else-if="showComingSoon"
          class="login-coming-soon hero-word hero-word-5"
        >
          Coming soon
        </p>
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
