<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useUserStore } from "@/stores/userStore";

const router = useRouter();
const route = useRoute();
const user = useUserStore();

const form = reactive({
  userName: user.userName,
  password: "admin",
});

const loading = ref(false);
const error = ref("");

onMounted(async () => {
  try {
    const res = await fetch("/api/a8/defaults");
    if (!res.ok) return;
    const body = (await res.json()) as { userName?: string; password?: string };
    if (body.userName?.trim()) form.userName = body.userName.trim();
    if (body.password) form.password = body.password;
  } catch {
    /* 后端未启动时保留默认 admin */
  }
});

async function submit() {
  if (!form.userName.trim() || !form.password || loading.value) return;
  loading.value = true;
  error.value = "";
  try {
    await user.login(form.password, form.userName.trim());
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
    <div class="slogo" />
    <div class="loginbox">
      <el-form :model="form" @submit.prevent="submit">
        <el-form-item>
          <el-input
            v-model="form.userName"
            size="large"
            placeholder="用户名"
            autocomplete="username"
          />
        </el-form-item>
        <el-form-item>
          <el-input
            v-model="form.password"
            type="password"
            show-password
            size="large"
            placeholder="密码"
            autocomplete="current-password"
          />
        </el-form-item>
        <p v-if="error" class="login-error">{{ error }}</p>
        <el-form-item>
          <el-button
            size="large"
            type="primary"
            style="width: 100%"
            :disabled="!form.userName || !form.password || loading"
            @click="submit"
          >
            {{ loading ? "登录中…" : "登录" }}
          </el-button>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<style scoped>
.login-error {
  margin: 0 0 8px;
  color: #f56c6c;
  font-size: 13px;
  text-align: center;
}
</style>
