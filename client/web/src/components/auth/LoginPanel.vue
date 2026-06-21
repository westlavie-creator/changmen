<script setup lang="ts">
import { reactive, ref } from "vue";
import { useUserStore } from "@/stores/userStore";

const emit = defineEmits<{
  success: [];
}>();

const user = useUserStore();

const form = reactive({
  userName: "",
  password: "",
});

const loading = ref(false);
const error = ref("");

async function submit() {
  if (!form.userName.trim() || !form.password || loading.value)
    return;

  loading.value = true;
  error.value = "";
  try {
    await user.login(form.password, form.userName.trim());
    emit("success");
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
  finally {
    loading.value = false;
  }
}
</script>

<template>
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
    <p v-if="error" class="login-error">
      {{ error }}
    </p>
    <el-form-item>
      <el-button
        native-type="submit"
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
</template>
