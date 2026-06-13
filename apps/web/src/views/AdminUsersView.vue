<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import AdminLayout from "@/components/admin/AdminLayout.vue";
import AdminUserDetail from "@/components/admin/AdminUserDetail.vue";
import {
  createAdminUser,
  getAdminUsers,
  resetAdminUserPassword,
} from "@/api/admin";
import type { AdminUserRow } from "@/types/admin";
import { useUserStore } from "@/stores/userStore";

const router = useRouter();
const userStore = useUserStore();

const date = ref(todayKey());
const loading = ref(false);
const users = ref<AdminUserRow[]>([]);
const keyword = ref("");
const detailUser = ref<AdminUserRow | null>(null);
const drawerOpen = ref(false);

const createDialog = ref(false);
const createForm = reactive({ userName: "", password: "", confirm: "" });
const createLoading = ref(false);

const resetDialog = ref(false);
const resetTarget = ref<AdminUserRow | null>(null);
const resetForm = reactive({ password: "", confirm: "" });
const resetLoading = ref(false);

const filteredUsers = computed(() => {
  const q = keyword.value.trim().toLowerCase();
  if (!q) return users.value;
  return users.value.filter(
    (u) =>
      u.userName.toLowerCase().includes(q) ||
      u.id.toLowerCase().includes(q),
  );
});

function todayKey() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function fmtTime(ts: number) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

function fmtMoney(n: number) {
  return Math.floor(n).toLocaleString();
}

async function loadUsers() {
  loading.value = true;
  try {
    users.value = await getAdminUsers(date.value);
  } finally {
    loading.value = false;
  }
}

function openDetail(row: AdminUserRow) {
  detailUser.value = row;
  drawerOpen.value = true;
}

function viewOrders(row: AdminUserRow) {
  router.push({
    name: "admin-orders",
    query: { userId: row.id, userName: row.userName, date: date.value },
  });
}

function openCreate() {
  createForm.userName = "";
  createForm.password = "";
  createForm.confirm = "";
  createDialog.value = true;
}

function openReset(row: AdminUserRow) {
  resetTarget.value = row;
  resetForm.password = "";
  resetForm.confirm = "";
  resetDialog.value = true;
}

async function submitCreate() {
  const name = createForm.userName.trim();
  if (!name) {
    ElMessage.warning("请输入用户名");
    return;
  }
  if (createForm.password.length < 6) {
    ElMessage.warning("密码至少 6 位");
    return;
  }
  if (createForm.password !== createForm.confirm) {
    ElMessage.warning("两次密码不一致");
    return;
  }
  createLoading.value = true;
  try {
    await createAdminUser(name, createForm.password);
    ElMessage.success(`用户 ${name} 已创建`);
    createDialog.value = false;
    await loadUsers();
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : "创建失败");
  } finally {
    createLoading.value = false;
  }
}

async function submitReset() {
  if (!resetTarget.value) return;
  if (resetForm.password.length < 6) {
    ElMessage.warning("密码至少 6 位");
    return;
  }
  if (resetForm.password !== resetForm.confirm) {
    ElMessage.warning("两次密码不一致");
    return;
  }
  resetLoading.value = true;
  try {
    await resetAdminUserPassword(resetTarget.value.id, resetForm.password);
    ElMessage.success(`已重置 ${resetTarget.value.userName} 的密码`);
    resetDialog.value = false;
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : "重置失败");
  } finally {
    resetLoading.value = false;
  }
}

watch(date, () => {
  void loadUsers();
});

onMounted(async () => {
  if (!userStore.ready) {
    try {
      await userStore.fetchUserInfo();
    } catch {
      sessionStorage.setItem("gamebet:postLoginRedirect", "/admin/users");
      await router.replace({ name: "home" });
      return;
    }
  }
  if (!userStore.isAdmin) {
    await router.replace({ name: "home" });
    return;
  }
  await loadUsers();
});
</script>

<template>
  <AdminLayout title="用户管理">
    <section class="admin-users-page" v-loading="loading">
      <div class="admin-users-toolbar">
        <el-date-picker
          v-model="date"
          type="date"
          value-format="YYYY-MM-DD"
          size="small"
          placeholder="统计日期"
          style="width: 150px"
        />
        <el-input
          v-model="keyword"
          clearable
          size="small"
          placeholder="搜索用户名 / ID"
          style="width: 200px"
        />
        <el-button size="small" @click="loadUsers">刷新</el-button>
        <el-button size="small" type="primary" @click="openCreate">新建用户</el-button>
      </div>

      <el-table :data="filteredUsers" size="small" stripe class="admin-users-table">
        <el-table-column prop="userName" label="用户名" min-width="100">
          <template #default="{ row }">
            <span>{{ row.userName }}</span>
            <el-tag v-if="row.isAdmin" size="small" type="warning" class="admin-users-admin-tag">管理员</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="accountCount" label="账号数" width="72" align="center" />
        <el-table-column label="当日盈利" width="96" align="right">
          <template #default="{ row }">
            <span :class="{ pos: row.todayMoney > 0, neg: row.todayMoney < 0 }">
              {{ fmtMoney(row.todayMoney) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="todayCount" label="当日订单" width="80" align="center" />
        <el-table-column label="当日流水" width="96" align="right">
          <template #default="{ row }">{{ fmtMoney(row.todayBetMoney) }}</template>
        </el-table-column>
        <el-table-column label="注册时间" min-width="150">
          <template #default="{ row }">{{ fmtTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openDetail(row)">详情</el-button>
            <el-button link type="primary" size="small" @click="viewOrders(row)">订单</el-button>
            <el-button link type="warning" size="small" @click="openReset(row)">重置密码</el-button>
          </template>
        </el-table-column>
      </el-table>

      <p v-if="!loading && !filteredUsers.length" class="admin-users-empty">暂无用户</p>
    </section>

    <el-drawer
      v-model="drawerOpen"
      :title="detailUser ? `${detailUser.userName} · 用户详情` : '用户详情'"
      size="92%"
      direction="rtl"
      destroy-on-close
    >
      <AdminUserDetail
        v-if="detailUser"
        :user="detailUser"
        @view-orders="viewOrders(detailUser)"
      />
    </el-drawer>

    <el-dialog v-model="createDialog" title="新建用户" width="400px" destroy-on-close>
      <el-form label-width="80px" @submit.prevent="submitCreate">
        <el-form-item label="用户名" required>
          <el-input v-model="createForm.userName" autocomplete="off" />
        </el-form-item>
        <el-form-item label="密码" required>
          <el-input v-model="createForm.password" type="password" show-password autocomplete="new-password" />
        </el-form-item>
        <el-form-item label="确认密码" required>
          <el-input v-model="createForm.confirm" type="password" show-password autocomplete="new-password" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialog = false">取消</el-button>
        <el-button type="primary" :loading="createLoading" @click="submitCreate">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="resetDialog"
      :title="resetTarget ? `重置密码 · ${resetTarget.userName}` : '重置密码'"
      width="400px"
      destroy-on-close
    >
      <el-form label-width="80px" @submit.prevent="submitReset">
        <el-form-item label="新密码" required>
          <el-input v-model="resetForm.password" type="password" show-password autocomplete="new-password" />
        </el-form-item>
        <el-form-item label="确认密码" required>
          <el-input v-model="resetForm.confirm" type="password" show-password autocomplete="new-password" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="resetDialog = false">取消</el-button>
        <el-button type="primary" :loading="resetLoading" @click="submitReset">确认重置</el-button>
      </template>
    </el-dialog>
  </AdminLayout>
</template>
