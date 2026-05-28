<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useUserStore } from "@/stores/userStore";

const router = useRouter();
const route = useRoute();
const user = useUserStore();

const userName = ref(user.userName);
const password = ref("admin");

onMounted(async () => {
  try {
    const res = await fetch("/api/a8/defaults");
    if (!res.ok) return;
    const body = (await res.json()) as { userName?: string; password?: string };
    if (body.userName?.trim()) userName.value = body.userName.trim();
    if (body.password) password.value = body.password;
  } catch {
    /* 后端未启动时保留默认 admin */
  }
});
const loading = ref(false);
const error = ref("");

async function submit() {
  loading.value = true;
  error.value = "";
  try {
    await user.login(password.value, userName.value.trim());
    const redirect = typeof route.query.redirect === "string" ? route.query.redirect : "/";
    await router.replace(redirect);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="container flex flex-middle flex-column">
    <div class="loginbox">
      <h2>登录</h2>
      <form class="login-form" @submit.prevent="submit">
        <label>
          用户名
          <input v-model="userName" type="text" autocomplete="username" required />
        </label>
        <label>
          密码
          <input v-model="password" type="password" autocomplete="current-password" required />
        </label>
        <p v-if="error" class="login-error">{{ error }}</p>
        <button type="submit" class="el-button el-button--primary" :disabled="loading">
          {{ loading ? "登录中…" : "登录" }}
        </button>
      </form>
      <p class="login-hint">
        本地调试可用 <code>admin</code> / <code>admin</code>；平博信用盘需 A8 账号（默认已预填
        <code>TJ01</code> / <code>a123456</code>，与 A8 一致）
      </p>
    </div>
  </div>
</template>

<style scoped>
.container {
  min-height: 100%;
  justify-content: center;
}
.loginbox {
  width: 320px;
  padding: 24px;
  background: #0006;
  border-radius: 8px;
  color: #fff;
}
.loginbox h2 {
  margin: 0 0 16px;
  font-size: 18px;
  text-align: center;
}
.login-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.login-form label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: #cbd5e1;
}
.login-form input {
  height: 32px;
  padding: 0 10px;
  border: 1px solid #ffffff33;
  border-radius: 4px;
  background: #0008;
  color: #fff;
}
.login-error {
  margin: 0;
  color: #f87171;
  font-size: 13px;
}
.login-hint {
  margin: 16px 0 0;
  font-size: 12px;
  color: #94a3b8;
  text-align: center;
}
code {
  color: #93c5fd;
}
</style>
