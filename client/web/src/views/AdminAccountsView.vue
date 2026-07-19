<script setup lang="ts">
import type { AdminAccountListRow } from "@/types/admin";
import { ElMessage } from "element-plus";
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { getAdminAccounts, updateAdminAccountFields } from "@/api/admin";
import AdminLayout from "@/components/admin/AdminLayout.vue";
import PlatformIcon from "@/components/platform/PlatformIcon.vue";
import { useUserStore } from "@/stores/userStore";
import { ALL_PLATFORMS } from "@/types/userConfig";

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

const loading = ref(false);
const saving = ref(false);
const rows = ref<AdminAccountListRow[]>([]);
const loadError = ref("");

const keyword = ref(String(route.query.q || ""));
const filterUserId = ref(String(route.query.userId || ""));
const filterProvider = ref(String(route.query.provider || ""));
const filterPause = ref<"all" | "active" | "paused">("all");

const editOpen = ref(false);
const editTarget = ref<AdminAccountListRow | null>(null);
const editForm = reactive({
  balance: 0,
  maxBalance: 0,
  multiply: 1,
  pause: false,
  description: "",
});

function isPredictFunRow(row: AdminAccountListRow | null | undefined) {
  return String(row?.platform || "") === "PredictFun";
}

const providerOptions = computed(() => {
  const set = new Set<string>();
  for (const r of rows.value) {
    const p = String(r.platform || "").trim();
    if (p)
      set.add(p);
  }
  for (const p of ALL_PLATFORMS)
    set.add(p);
  return [...set].sort((a, b) => a.localeCompare(b));
});

const userOptions = computed(() => {
  const map = new Map<string, string>();
  for (const r of rows.value)
    map.set(r.userId, r.userName);
  return [...map.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "zh"));
});

const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase();
  return rows.value.filter((r) => {
    if (filterUserId.value && r.userId !== filterUserId.value)
      return false;
    if (filterProvider.value && r.platform !== filterProvider.value)
      return false;
    if (filterPause.value === "active" && r.pause)
      return false;
    if (filterPause.value === "paused" && !r.pause)
      return false;
    if (!q)
      return true;
    const hay = [
      r.userName,
      r.playerName,
      r.platform,
      r.platformName,
      r.venueAccountName,
      r.venueMemberId,
      r.description,
      String(r.accountId),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
});

function memberLabel(row: AdminAccountListRow) {
  if (row.platform === "PredictFun")
    return row.playerName || row.userName || "—";
  return row.venueAccountName || row.playerName || "—";
}

function fmtMoney(n: number | undefined) {
  if (n == null || Number.isNaN(Number(n)))
    return "—";
  return Math.floor(Number(n)).toLocaleString();
}

function moneyClass(n: number | undefined) {
  const v = Number(n) || 0;
  if (v > 0)
    return "pos";
  if (v < 0)
    return "neg";
  return "";
}

function syncQuery() {
  const q: Record<string, string> = {};
  if (keyword.value.trim())
    q.q = keyword.value.trim();
  if (filterUserId.value)
    q.userId = filterUserId.value;
  if (filterProvider.value)
    q.provider = filterProvider.value;
  void router.replace({ name: "admin-accounts", query: q });
}

async function load() {
  loadError.value = "";
  loading.value = true;
  try {
    rows.value = await getAdminAccounts();
  }
  catch (e) {
    rows.value = [];
    loadError.value = (e as Error).message || "加载失败";
  }
  finally {
    loading.value = false;
  }
}

function openEdit(row: AdminAccountListRow) {
  editTarget.value = row;
  editForm.balance = Number(isPredictFunRow(row) ? row.balance : row.credit) || 0;
  editForm.maxBalance = Number(row.maxBalance) || 0;
  editForm.multiply = Number(row.multiply) || 1;
  editForm.pause = Boolean(row.pause);
  editForm.description = String(row.description || "");
  editOpen.value = true;
}

async function saveEdit() {
  const target = editTarget.value;
  if (!target || saving.value)
    return;
  saving.value = true;
  try {
    const updated = await updateAdminAccountFields({
      userId: target.userId,
      accountId: target.accountId,
      ...(isPredictFunRow(target)
        ? { balance: editForm.balance }
        : { credit: editForm.balance }),
      maxBalance: editForm.maxBalance,
      multiply: editForm.multiply,
      pause: editForm.pause,
      description: editForm.description,
    });
    const idx = rows.value.findIndex(
      r => r.userId === target.userId && r.accountId === target.accountId,
    );
    if (idx >= 0) {
      rows.value[idx] = {
        ...rows.value[idx],
        ...updated,
        userId: target.userId,
        userName: target.userName,
        teamId: target.teamId,
      };
    }
    editOpen.value = false;
    ElMessage.success("已保存");
  }
  catch (e) {
    ElMessage.error((e as Error).message || "保存失败");
  }
  finally {
    saving.value = false;
  }
}

function goOrders(row: AdminAccountListRow) {
  void router.push({
    name: "admin-orders",
    query: {
      userId: row.userId,
      userName: row.userName,
      playerId: String(row.accountId),
    },
  });
}

function goUser(row: AdminAccountListRow) {
  void router.push({
    name: "admin-users",
    query: { userId: row.userId },
  });
}

onMounted(async () => {
  if (!userStore.ready) {
    try {
      await userStore.fetchUserInfo();
    }
    catch {
      sessionStorage.setItem("gamebet:postLoginRedirect", route.fullPath);
      await router.replace({ name: "home" });
      return;
    }
  }
  if (!userStore.isAdmin) {
    await router.replace({ name: "home" });
    return;
  }
  await load();
});
</script>

<template>
  <AdminLayout title="子账号管理" subtitle="按用户查看投注子账号：暂停、乘网与今日战绩">
    <section v-loading="loading" class="admin-card">
      <div class="admin-card__toolbar admin-accounts-toolbar">
        <el-input
          v-model="keyword"
          clearable
          size="small"
          placeholder="搜索用户 / 会员名 / 场馆"
          style="width: 220px"
          @change="syncQuery"
          @clear="syncQuery"
        />
        <el-select
          v-model="filterUserId"
          clearable
          filterable
          size="small"
          placeholder="用户"
          style="width: 140px"
          @change="syncQuery"
        >
          <el-option
            v-for="u in userOptions"
            :key="u.id"
            :label="u.name"
            :value="u.id"
          />
        </el-select>
        <el-select
          v-model="filterProvider"
          clearable
          filterable
          size="small"
          placeholder="场馆"
          style="width: 130px"
          @change="syncQuery"
        >
          <el-option
            v-for="p in providerOptions"
            :key="p"
            :label="p"
            :value="p"
          />
        </el-select>
        <el-select v-model="filterPause" size="small" style="width: 110px">
          <el-option label="全部状态" value="all" />
          <el-option label="使用中" value="active" />
          <el-option label="已暂停" value="paused" />
        </el-select>
        <el-button size="small" @click="load">
          刷新
        </el-button>
        <span class="admin-accounts-count">
          {{ filtered.length }} / {{ rows.length }} 个账号
        </span>
      </div>

      <p v-if="loadError" class="admin-card__empty admin-card__empty--error">
        {{ loadError }}
      </p>

      <div v-else class="admin-card__body">
        <el-table :data="filtered" size="small" stripe class="admin-accounts-table">
          <el-table-column label="用户" width="110" fixed>
            <template #default="{ row }">
              <button type="button" class="admin-link-btn" @click="goUser(row)">
                {{ row.userName }}
              </button>
            </template>
          </el-table-column>
          <el-table-column label="场馆" width="100">
            <template #default="{ row }">
              <div class="admin-accounts-provider">
                <PlatformIcon :platform="row.platform" />
                <span>{{ row.platform || "—" }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="会员名" min-width="120">
            <template #default="{ row }">
              <div class="admin-accounts-member">
                <span>{{ memberLabel(row) }}</span>
                <span class="admin-accounts-member__id">#{{ row.accountId }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="余额" width="100" align="right">
            <template #default="{ row }">
              {{ fmtMoney(isPredictFunRow(row) ? row.balance : row.credit) }}
            </template>
          </el-table-column>
          <el-table-column label="上限" width="100" align="right">
            <template #default="{ row }">
              {{ fmtMoney(row.maxBalance) }}
            </template>
          </el-table-column>
          <el-table-column label="乘网" width="72" align="center" prop="multiply" />
          <el-table-column label="今日" width="100" align="right">
            <template #default="{ row }">
              <span :class="moneyClass(row.today)">{{ fmtMoney(row.today) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="累计盈亏" width="110" align="right">
            <template #default="{ row }">
              <span :class="moneyClass(row.totalProfit)">{{ fmtMoney(row.totalProfit) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="88" align="center">
            <template #default="{ row }">
              <el-tag v-if="row.pause" type="danger" size="small">
                暂停
              </el-tag>
              <el-tag v-else type="success" size="small">
                使用中
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="150" fixed="right" align="center">
            <template #default="{ row }">
              <el-button size="small" link type="primary" @click="openEdit(row)">
                编辑
              </el-button>
              <el-button size="small" link @click="goOrders(row)">
                订单
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </section>

    <el-dialog
      v-model="editOpen"
      title="编辑子账号"
      width="480px"
      destroy-on-close
      append-to-body
    >
      <template v-if="editTarget">
        <p class="admin-accounts-edit-meta">
          {{ editTarget.userName }} · {{ editTarget.platform }} · {{ memberLabel(editTarget) }}
          <span class="admin-accounts-member__id">#{{ editTarget.accountId }}</span>
        </p>
        <el-form label-width="96px">
          <el-form-item :label="isPredictFunRow(editTarget) ? '余额' : '授信'">
            <el-input-number v-model="editForm.balance" :min="0" :step="100" controls-position="right" />
          </el-form-item>
          <el-form-item label="上限">
            <el-input-number v-model="editForm.maxBalance" :min="0" :step="100" controls-position="right" />
          </el-form-item>
          <el-form-item label="乘网">
            <el-input-number v-model="editForm.multiply" :min="0.01" :step="0.01" :precision="2" controls-position="right" />
          </el-form-item>
          <el-form-item label="暂停">
            <el-switch v-model="editForm.pause" />
          </el-form-item>
          <el-form-item label="备注">
            <el-input v-model="editForm.description" type="textarea" :rows="2" />
          </el-form-item>
        </el-form>
      </template>
      <template #footer>
        <el-button @click="editOpen = false">
          取消
        </el-button>
        <el-button type="primary" :loading="saving" @click="saveEdit">
          保存
        </el-button>
      </template>
    </el-dialog>
  </AdminLayout>
</template>

<style scoped>
.admin-accounts-toolbar {
  flex-wrap: wrap;
  gap: 8px;
}
.admin-accounts-count {
  margin-left: auto;
  font-size: 12px;
  color: var(--adm-text-muted, #94a3b8);
}
.admin-accounts-provider {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.admin-accounts-member {
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.3;
}
.admin-accounts-member__id {
  font-size: 11px;
  color: var(--adm-text-muted, #94a3b8);
  font-family: ui-monospace, monospace;
}
.admin-accounts-edit-meta {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--adm-text-muted, #94a3b8);
}
.admin-link-btn {
  border: 0;
  background: transparent;
  color: var(--el-color-primary);
  cursor: pointer;
  padding: 0;
  font: inherit;
}
.admin-link-btn:hover {
  text-decoration: underline;
}
.pos { color: #67c23a; }
.neg { color: #f56c6c; }
</style>
