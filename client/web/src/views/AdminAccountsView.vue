<script setup lang="ts">
import type { AdminAccountListRow } from "@/types/admin";
import { ElMessage } from "element-plus";
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { getAdminAccounts, updateAdminAccountFields } from "@/api/admin";
import AdminLayout from "@/components/admin/AdminLayout.vue";
import AdminUserAccountsColumn from "@/components/admin/AdminUserAccountsColumn.vue";
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

const hScrollRef = ref<HTMLElement | null>(null);
const hScrollDragging = ref(false);
let dragStartX = 0;
let dragStartScroll = 0;

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
    const deleted = Boolean(r.deleted) || r.deletedAt != null;
    // 暂停筛选只作用于活跃账号；软删始终保留（单独区块展示）
    if (!deleted) {
      if (filterPause.value === "active" && r.pause)
        return false;
      if (filterPause.value === "paused" && !r.pause)
        return false;
    }
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

/** 用户横向分列：每位用户一列，列内为该用户的子账号（软删排后） */
const userColumns = computed(() => {
  const map = new Map<string, {
    userId: string;
    userName: string;
    accounts: AdminAccountListRow[];
  }>();
  for (const r of filtered.value) {
    let col = map.get(r.userId);
    if (!col) {
      col = { userId: r.userId, userName: r.userName, accounts: [] };
      map.set(r.userId, col);
    }
    col.accounts.push(r);
  }
  for (const col of map.values()) {
    col.accounts.sort((a, b) => {
      const ad = (Boolean(a.deleted) || a.deletedAt != null) ? 1 : 0;
      const bd = (Boolean(b.deleted) || b.deletedAt != null) ? 1 : 0;
      if (ad !== bd)
        return ad - bd;
      return String(a.platform || "").localeCompare(String(b.platform || ""))
        || String(a.venueAccountName || a.playerName || "").localeCompare(
          String(b.venueAccountName || b.playerName || ""),
          "zh",
        )
        || a.accountId - b.accountId;
    });
  }
  return [...map.values()].sort((a, b) =>
    a.userName.localeCompare(b.userName, "zh"),
  );
});

const activeAccountCount = computed(() =>
  filtered.value.filter(r => !(Boolean(r.deleted) || r.deletedAt != null)).length,
);
const deletedAccountCount = computed(() =>
  filtered.value.filter(r => Boolean(r.deleted) || r.deletedAt != null).length,
);

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

function scrollAccountsBy(dx: number) {
  const el = hScrollRef.value;
  if (!el)
    return;
  el.scrollLeft = Math.max(0, Math.min(el.scrollWidth - el.clientWidth, el.scrollLeft + dx));
}

function onHScrollPointerDown(e: PointerEvent) {
  const el = hScrollRef.value;
  if (!el || e.button !== 0)
    return;
  const t = e.target;
  if (t instanceof Element && t.closest("button, a, input, textarea, select, .el-button, .el-tag"))
    return;
  hScrollDragging.value = true;
  dragStartX = e.clientX;
  dragStartScroll = el.scrollLeft;
  el.setPointerCapture(e.pointerId);
}

function onHScrollPointerMove(e: PointerEvent) {
  const el = hScrollRef.value;
  if (!el || !hScrollDragging.value)
    return;
  el.scrollLeft = dragStartScroll - (e.clientX - dragStartX);
}

function onHScrollPointerUp(e: PointerEvent) {
  const el = hScrollRef.value;
  if (!el)
    return;
  hScrollDragging.value = false;
  try {
    el.releasePointerCapture(e.pointerId);
  }
  catch {
    /* ignore */
  }
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
        ? {}
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
  <AdminLayout title="子账号管理" subtitle="按用户横向查看操盘子账号：暂停、乘网与今日战绩">
    <section v-loading="loading" class="admin-card admin-card--accounts">
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
        <span
          v-if="userColumns.length"
          class="admin-orders-hscroll-btns"
        >
          <el-button size="small" @click="scrollAccountsBy(-320)">
            ←
          </el-button>
          <el-button size="small" @click="scrollAccountsBy(320)">
            →
          </el-button>
        </span>
        <span class="admin-accounts-count">
          {{ userColumns.length }} 位用户 · {{ activeAccountCount }} 活跃
          <template v-if="deletedAccountCount">
            · {{ deletedAccountCount }} 已删
          </template>
          / {{ rows.length }}
        </span>
      </div>

      <p v-if="loadError" class="admin-card__empty admin-card__empty--error">
        {{ loadError }}
      </p>

      <div v-else class="admin-card__body admin-accounts-page__body">
        <div
          v-if="userColumns.length"
          ref="hScrollRef"
          class="admin-orders-hscroll"
          :class="{ 'is-dragging': hScrollDragging }"
          @pointerdown="onHScrollPointerDown"
          @pointermove="onHScrollPointerMove"
          @pointerup="onHScrollPointerUp"
          @pointercancel="onHScrollPointerUp"
        >
          <div class="admin-accounts-by-user">
            <AdminUserAccountsColumn
              v-for="col in userColumns"
              :key="col.userId"
              :user-name="col.userName"
              :accounts="col.accounts"
              @edit="openEdit"
              @orders="goOrders"
              @user="goUser"
            />
          </div>
        </div>

        <p
          v-else-if="!loading"
          class="admin-card__empty"
        >
          {{ rows.length ? "当前筛选无匹配账号" : "暂无子账号" }}
        </p>
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
          <el-form-item v-if="isPredictFunRow(editTarget)" label="余额">
            <span>{{ fmtMoney(editTarget.balance) }}（PredictFun 会员充值已下线）</span>
          </el-form-item>
          <el-form-item v-else label="授信">
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
.admin-accounts-edit-meta {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--adm-text-muted, #94a3b8);
}
.admin-accounts-member__id {
  font-size: 11px;
  color: var(--adm-text-muted, #94a3b8);
  font-family: ui-monospace, monospace;
}
</style>
