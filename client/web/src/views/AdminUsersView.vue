<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import AdminLayout from "@/components/admin/AdminLayout.vue";
import AdminUserDetail from "@/components/admin/AdminUserDetail.vue";
import {
  createAdminUser,
  getAdminUsers,
  renameAdminUser,
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

const renameDialog = ref(false);
const renameTarget = ref<AdminUserRow | null>(null);
const renameForm = reactive({ userName: "" });
const renameLoading = ref(false);

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

function onlineLabel(row: AdminUserRow) {
  return Number(row.isOnline) === 1 ? "在线" : "离线";
}

function bettingStatusClass(row: AdminUserRow) {
  if (Number(row.bettingEnabled) === 1) return "admin-user-status--betting-on";
  if (Number(row.bettingScheduled) === 1) return "admin-user-status--betting-scheduled";
  return "admin-user-status--betting-off";
}

function bettingLabel(row: AdminUserRow) {
  if (Number(row.bettingEnabled) === 1) return "开启";
  if (Number(row.bettingScheduled) === 1) return "定时";
  return "关闭";
}

function bettingTitle(row: AdminUserRow) {
  if (Number(row.bettingScheduled) === 1 && row.bettingAutoOpenTime) {
    return `定时开启：${fmtTime(row.bettingAutoOpenTime)}`;
  }
  if (Number(row.bettingEnabled) === 1) return "自动投注已开启";
  return "自动投注已关闭";
}

function fmtBetMoney(row: AdminUserRow) {
  const base = Number(row.betMoney) || 0;
  return base > 0 ? fmtMoney(base) : "—";
}

const onlineCount = computed(
  () => filteredUsers.value.filter((u) => Number(u.isOnline) === 1).length,
);

let refreshTimer: ReturnType<typeof setInterval> | null = null;

function fmtMoney(n: number) {
  return Math.floor(n).toLocaleString();
}

function userInitial(name: string) {
  return (name || "?").slice(0, 1).toUpperCase();
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

function openRename(row: AdminUserRow) {
  renameTarget.value = row;
  renameForm.userName = row.userName;
  renameDialog.value = true;
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

async function submitRename() {
  if (!renameTarget.value) return;
  const name = renameForm.userName.trim();
  if (!name) {
    ElMessage.warning("请输入用户名");
    return;
  }
  if (name === renameTarget.value.userName) {
    renameDialog.value = false;
    return;
  }
  renameLoading.value = true;
  try {
    await renameAdminUser(renameTarget.value.id, name);
    ElMessage.success(`用户名已更改为 ${name}`);
    renameDialog.value = false;
    if (detailUser.value?.id === renameTarget.value.id) {
      detailUser.value = { ...detailUser.value, userName: name };
    }
    await loadUsers();
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : "更改失败");
  } finally {
    renameLoading.value = false;
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
  refreshTimer = setInterval(() => {
    void loadUsers();
  }, 30_000);
});

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer);
});
</script>

<template>
  <AdminLayout title="用户管理" subtitle="账号创建、密码重置与用户详情">
    <section class="admin-card" v-loading="loading">
      <div class="admin-card__toolbar">
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
        <span v-if="users.length" class="admin-users-online-hint">
          在线 {{ onlineCount }} / {{ users.length }}
        </span>
        <el-button size="small" type="primary" @click="openCreate">新建用户</el-button>
      </div>

      <div class="admin-card__body">
        <el-table :data="filteredUsers" size="small" stripe class="admin-users-table">
        <el-table-column prop="userName" label="用户名" min-width="120">
          <template #default="{ row }">
            <div class="admin-user-cell">
              <span class="admin-user-cell__avatar">{{ userInitial(row.userName) }}</span>
              <span>{{ row.userName }}</span>
              <span v-if="row.isAdmin" class="admin-badge admin-badge--admin">管理员</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="88" align="center">
          <template #default="{ row }">
            <span
              class="admin-user-status"
              :class="Number(row.isOnline) === 1 ? 'admin-user-status--online' : 'admin-user-status--offline'"
            >
              <i class="admin-user-status__dot" aria-hidden="true" />
              {{ onlineLabel(row) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="投注" width="88" align="center">
          <template #default="{ row }">
            <span
              class="admin-user-status"
              :class="bettingStatusClass(row)"
              :title="bettingTitle(row)"
            >
              <i class="admin-user-status__dot" aria-hidden="true" />
              {{ bettingLabel(row) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="下注金额" width="96" align="right">
          <template #default="{ row }">{{ fmtBetMoney(row) }}</template>
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
        <el-table-column label="最近活跃" min-width="150">
          <template #default="{ row }">{{ fmtTime(row.lastActiveAt || 0) }}</template>
        </el-table-column>
        <el-table-column label="最后登录 IP" min-width="130" show-overflow-tooltip>
          <template #default="{ row }">
            <span
              :title="row.lastLoginAt ? `登录于 ${fmtTime(row.lastLoginAt)}` : ''"
            >
              {{ row.lastLoginIp || "—" }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="注册时间" min-width="150">
          <template #default="{ row }">{{ fmtTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="280" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openDetail(row)">详情</el-button>
            <el-button link type="primary" size="small" @click="viewOrders(row)">订单</el-button>
            <el-button link type="primary" size="small" @click="openRename(row)">改用户名</el-button>
            <el-button link type="warning" size="small" @click="openReset(row)">重置密码</el-button>
          </template>
        </el-table-column>
      </el-table>

      <p v-if="!loading && !filteredUsers.length" class="admin-card__empty">暂无用户</p>
      </div>
    </section>

    <el-drawer
      v-model="drawerOpen"
      :title="detailUser ? `${detailUser.userName} · 用户详情` : '用户详情'"
      class="admin-drawer"
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

    <el-dialog v-model="createDialog" title="新建用户" class="admin-dialog" width="400px" destroy-on-close>
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
      class="admin-dialog"
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

    <el-dialog
      v-model="renameDialog"
      class="admin-dialog"
      :title="renameTarget ? `更改用户名 · ${renameTarget.userName}` : '更改用户名'"
      width="400px"
      destroy-on-close
    >
      <el-form label-width="80px" @submit.prevent="submitRename">
        <el-form-item label="新用户名" required>
          <el-input v-model="renameForm.userName" autocomplete="off" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="renameDialog = false">取消</el-button>
        <el-button type="primary" :loading="renameLoading" @click="submitRename">确认更改</el-button>
      </template>
    </el-dialog>
  </AdminLayout>
</template>
