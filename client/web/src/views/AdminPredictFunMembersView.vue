<script setup lang="ts">
import type { AdminPredictFunMemberRow } from "@/api/admin";
import { ElMessage } from "element-plus";
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  ensureAdminPredictFunHouseAccount,
  getAdminPredictFunMembers,
  updateAdminAccountFields,
} from "@/api/admin";
import AdminLayout from "@/components/admin/AdminLayout.vue";
import { useUserStore } from "@/stores/userStore";

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

const loading = ref(false);
const saving = ref(false);
const ensuringId = ref("");
const rows = ref<AdminPredictFunMemberRow[]>([]);
const loadError = ref("");

const keyword = ref(String(route.query.q || ""));
const filterStatus = ref<"all" | "open" | "closed" | "paused">("all");

const editOpen = ref(false);
const editTarget = ref<AdminPredictFunMemberRow | null>(null);
const editForm = reactive({
  balance: 0,
  maxBalance: 0,
  multiply: 1,
  pause: false,
  description: "",
});

const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase();
  return rows.value.filter((r) => {
    if (filterStatus.value === "open" && !r.hasAccount)
      return false;
    if (filterStatus.value === "closed" && r.hasAccount)
      return false;
    if (filterStatus.value === "paused" && (!r.hasAccount || !r.pause))
      return false;
    if (!q)
      return true;
    const hay = [r.userName, r.memberName, r.description, String(r.accountId)]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
});

const openedCount = computed(() => rows.value.filter(r => r.hasAccount).length);

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
  if (filterStatus.value !== "all")
    q.status = filterStatus.value;
  void router.replace({ name: "admin-predictfun-members", query: q });
}

async function load() {
  loadError.value = "";
  loading.value = true;
  try {
    rows.value = await getAdminPredictFunMembers();
  }
  catch (e) {
    rows.value = [];
    loadError.value = (e as Error).message || "加载失败";
  }
  finally {
    loading.value = false;
  }
}

async function onEnsure(row: AdminPredictFunMemberRow) {
  if (ensuringId.value)
    return;
  ensuringId.value = row.userId;
  try {
    const result = await ensureAdminPredictFunHouseAccount(row.userId);
    ElMessage.success(
      result.created
        ? `已开通会员「${result.account.playerName || row.userName}」`
        : `会员已存在「${result.account.playerName || row.userName}」`,
    );
    await load();
  }
  catch (e) {
    ElMessage.error((e as Error).message || "开通失败");
  }
  finally {
    ensuringId.value = "";
  }
}

function openEdit(row: AdminPredictFunMemberRow) {
  if (!row.hasAccount || !row.accountId) {
    ElMessage.warning("请先开通 PF 会员");
    return;
  }
  editTarget.value = row;
  editForm.balance = Number(row.balance) || 0;
  editForm.maxBalance = Number(row.maxBalance) || 0;
  editForm.multiply = Number(row.multiply) || 1;
  editForm.pause = Boolean(row.pause);
  editForm.description = String(row.description || "");
  editOpen.value = true;
}

async function saveEdit() {
  const target = editTarget.value;
  if (!target?.accountId || saving.value)
    return;
  saving.value = true;
  try {
    await updateAdminAccountFields({
      userId: target.userId,
      accountId: target.accountId,
      balance: editForm.balance,
      maxBalance: editForm.maxBalance,
      multiply: editForm.multiply,
      pause: editForm.pause,
      description: editForm.description,
    });
    editOpen.value = false;
    ElMessage.success("已保存");
    await load();
  }
  catch (e) {
    ElMessage.error((e as Error).message || "保存失败");
  }
  finally {
    saving.value = false;
  }
}

function goOrders(row: AdminPredictFunMemberRow) {
  if (!row.accountId) {
    ElMessage.warning("尚未开通会员");
    return;
  }
  void router.push({
    name: "admin-orders",
    query: {
      userId: row.userId,
      userName: row.userName,
      playerId: String(row.accountId),
      provider: "PredictFun",
    },
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
  const status = String(route.query.status || "");
  if (status === "open" || status === "closed" || status === "paused")
    filterStatus.value = status;
  await load();
});
</script>

<template>
  <AdminLayout
    title="PF 会员"
    subtitle="Predict.fun changmen 会员：登录名即会员名，运营主号代下；战绩按会员账号统计"
  >
    <section v-loading="loading" class="admin-card">
      <div class="admin-card__toolbar admin-pf-toolbar">
        <el-input
          v-model="keyword"
          clearable
          size="small"
          placeholder="搜索用户 / 会员名"
          style="width: 200px"
          @change="syncQuery"
          @clear="syncQuery"
        />
        <el-select
          v-model="filterStatus"
          size="small"
          style="width: 120px"
          @change="syncQuery"
        >
          <el-option label="全部" value="all" />
          <el-option label="已开通" value="open" />
          <el-option label="未开通" value="closed" />
          <el-option label="已暂停" value="paused" />
        </el-select>
        <el-button size="small" @click="load">
          刷新
        </el-button>
        <span class="admin-pf-count">
          已开通 {{ openedCount }} / {{ rows.length }}
        </span>
      </div>

      <p class="admin-pf-hint">
        会员名固定为 changmen 登录名；下单走 VPS 运营主号。用户也可自行在前台添加 PredictFun 账号。
      </p>

      <p v-if="loadError" class="admin-card__empty admin-card__empty--error">
        {{ loadError }}
      </p>

      <div v-else class="admin-card__body">
        <el-table :data="filtered" size="small" stripe>
          <el-table-column label="用户" width="120" prop="userName" />
          <el-table-column label="会员名" min-width="120">
            <template #default="{ row }">
              <div class="admin-pf-member">
                <span>{{ row.memberName || "—" }}</span>
                <span v-if="row.accountId" class="admin-pf-member__id">#{{ row.accountId }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="96" align="center">
            <template #default="{ row }">
              <el-tag v-if="!row.hasAccount" type="info" size="small">
                未开通
              </el-tag>
              <el-tag v-else-if="row.pause" type="danger" size="small">
                暂停
              </el-tag>
              <el-tag v-else type="success" size="small">
                使用中
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="余额" width="100" align="right">
            <template #default="{ row }">
              {{ row.hasAccount ? fmtMoney(row.balance) : "—" }}
            </template>
          </el-table-column>
          <el-table-column label="今日" width="100" align="right">
            <template #default="{ row }">
              <span v-if="row.hasAccount" :class="moneyClass(row.today)">{{ fmtMoney(row.today) }}</span>
              <span v-else>—</span>
            </template>
          </el-table-column>
          <el-table-column label="累计盈亏" width="110" align="right">
            <template #default="{ row }">
              <span v-if="row.hasAccount" :class="moneyClass(row.totalProfit)">{{ fmtMoney(row.totalProfit) }}</span>
              <span v-else>—</span>
            </template>
          </el-table-column>
          <el-table-column label="备注" min-width="120" show-overflow-tooltip>
            <template #default="{ row }">
              {{ row.description || "—" }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="200" fixed="right" align="center">
            <template #default="{ row }">
              <el-button
                v-if="!row.hasAccount"
                size="small"
                link
                type="primary"
                :loading="ensuringId === row.userId"
                @click="onEnsure(row)"
              >
                开通
              </el-button>
              <template v-else>
                <el-button size="small" link type="primary" @click="openEdit(row)">
                  编辑
                </el-button>
                <el-button size="small" link @click="goOrders(row)">
                  订单
                </el-button>
              </template>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </section>

    <el-dialog
      v-model="editOpen"
      title="编辑 PF 会员"
      width="480px"
      destroy-on-close
      append-to-body
    >
      <template v-if="editTarget">
        <p class="admin-pf-edit-meta">
          {{ editTarget.userName }} · 会员 {{ editTarget.memberName }}
          <span class="admin-pf-member__id">#{{ editTarget.accountId }}</span>
        </p>
        <el-form label-width="96px">
          <el-form-item label="余额">
            <el-input-number v-model="editForm.balance" :min="0" :step="100" controls-position="right" />
          </el-form-item>
          <el-form-item label="上限">
            <el-input-number v-model="editForm.maxBalance" :min="0" :step="100" controls-position="right" />
          </el-form-item>
          <el-form-item label="乘网">
            <el-input-number
              v-model="editForm.multiply"
              :min="0.01"
              :step="0.01"
              :precision="2"
              controls-position="right"
            />
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
.admin-pf-toolbar {
  flex-wrap: wrap;
  gap: 8px;
}
.admin-pf-count {
  margin-left: auto;
  font-size: 12px;
  color: var(--adm-text-muted, #94a3b8);
}
.admin-pf-hint {
  margin: 0 12px 10px;
  font-size: 12px;
  color: var(--adm-text-muted, #94a3b8);
  line-height: 1.5;
}
.admin-pf-member {
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.3;
}
.admin-pf-member__id {
  font-size: 11px;
  color: var(--adm-text-muted, #94a3b8);
  font-family: ui-monospace, monospace;
}
.admin-pf-edit-meta {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--adm-text-muted, #94a3b8);
}
.pos { color: #67c23a; }
.neg { color: #f56c6c; }
</style>
