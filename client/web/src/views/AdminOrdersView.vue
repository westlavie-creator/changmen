<script setup lang="ts">
import type { AdminAccountDetail, AdminOrderRow, AdminUserRow } from "@/types/admin";
import { ElMessage, ElMessageBox } from "element-plus";
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { deleteAdminOrders, getAdminOrdersAll, getAdminUsers } from "@/api/admin";
import AdminAccountOrdersColumn from "@/components/admin/AdminAccountOrdersColumn.vue";
import AdminLayout from "@/components/admin/AdminLayout.vue";
import AdminOrderLinkLines from "@/components/admin/AdminOrderLinkLines.vue";
import AdminUserOrdersColumn from "@/components/admin/AdminUserOrdersColumn.vue";
import OrderDateNav from "@/components/order/OrderDateNav.vue";
import { adminOrderDisplayProvider } from "@/shared/adminOrderDisplay";
import { todayKey } from "@/shared/dateKey";
import { useUserStore } from "@/stores/userStore";

type GroupMode = "user" | "account";

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

const date = ref(String(route.query.date || todayKey()));
const filterProvider = ref("");
const filterUserId = ref(String(route.query.userId || ""));
const groupMode = ref<GroupMode>(
  route.query.view === "account" ? "account" : "user",
);
const loading = ref(false);
const orders = ref<AdminOrderRow[]>([]);
const users = ref<AdminUserRow[]>([]);
const loadError = ref("");
const columnsContainerRef = ref<HTMLElement | null>(null);

interface AccountColumn {
  key: string;
  provider: string;
  playerId: number;
  playerName: string;
  userName: string;
  orders: AdminOrderRow[];
  accounts: AdminAccountDetail[];
}

const allAccounts = computed<AdminAccountDetail[]>(() => {
  const result: AdminAccountDetail[] = [];
  for (const user of users.value) {
    for (const acc of user.accounts ?? [])
      result.push(acc);
  }
  return result;
});

const accountById = computed(() => {
  const map = new Map<number, { account: AdminAccountDetail; user: AdminUserRow }>();
  for (const user of users.value) {
    for (const acc of user.accounts ?? [])
      map.set(Number(acc.accountId), { account: acc, user });
  }
  return map;
});

const filteredOrders = computed(() => {
  if (!filterUserId.value)
    return orders.value;
  return orders.value.filter(r => r.userId === filterUserId.value);
});

const userFilterOptions = computed(() =>
  [...users.value]
    .sort((a, b) => a.userName.localeCompare(b.userName, "zh-CN"))
    .map(u => ({
      value: u.id,
      label: `${u.userName}（${u.accounts?.length ?? 0} 账号）`,
    })),
);

const userColumns = computed(() => {
  const byUser = new Map<string, AdminOrderRow[]>();
  for (const row of filteredOrders.value) {
    if (!byUser.has(row.userId))
      byUser.set(row.userId, []);
    byUser.get(row.userId)!.push(row);
  }

  const userById = new Map(users.value.map(u => [u.id, u]));
  const sourceUsers = filterUserId.value
    ? users.value.filter(u => u.id === filterUserId.value)
    : users.value;

  const cols = sourceUsers.map(user => ({
    userId: user.id,
    userName: user.userName,
    accounts: user.accounts ?? [],
    orders: byUser.get(user.id) ?? [],
  }));

  for (const [userId, userOrders] of byUser) {
    if (userById.has(userId))
      continue;
    cols.push({
      userId,
      userName: userId.slice(0, 8),
      accounts: [],
      orders: userOrders,
    });
  }

  cols.sort((a, b) => a.userName.localeCompare(b.userName, "zh-CN"));
  return cols;
});

const accountColumns = computed<AccountColumn[]>(() => {
  const byAccount = new Map<number, AccountColumn>();
  for (const row of filteredOrders.value) {
    const playerId = Number(row.playerId) || 0;
    if (!byAccount.has(playerId)) {
      const hit = accountById.value.get(playerId);
      const provider = adminOrderDisplayProvider(row, hit ? [hit.account] : allAccounts.value);
      byAccount.set(playerId, {
        key: String(playerId),
        provider,
        playerId,
        playerName: hit?.account.playerName || "",
        userName: hit?.user.userName || "",
        orders: [],
        accounts: hit ? [hit.account] : [],
      });
    }
    byAccount.get(playerId)!.orders.push(row);
  }

  // Include selected user's empty accounts so operators can see which have no orders
  if (filterUserId.value) {
    const user = users.value.find(u => u.id === filterUserId.value);
    for (const acc of user?.accounts ?? []) {
      const playerId = Number(acc.accountId);
      if (byAccount.has(playerId))
        continue;
      byAccount.set(playerId, {
        key: String(playerId),
        provider: acc.platform || acc.platformName || "—",
        playerId,
        playerName: acc.playerName || "",
        userName: user?.userName || "",
        orders: [],
        accounts: [acc],
      });
    }
  }

  return [...byAccount.values()].sort(
    (a, b) =>
      a.provider.localeCompare(b.provider)
      || a.playerName.localeCompare(b.playerName, "zh-CN")
      || a.playerId - b.playerId,
  );
});

const hasContent = computed(() =>
  groupMode.value === "account"
    ? accountColumns.value.length > 0
    : userColumns.value.length > 0,
);

const linkLinesKey = computed(() =>
  `${filteredOrders.value.length}:${filterUserId.value}`,
);

const profitTotal = computed(() =>
  filteredOrders.value.reduce((sum, r) => sum + (Number(r.money) || 0), 0),
);

const subtitle = computed(() =>
  groupMode.value === "account"
    ? "按投注账号分列，同 Link 订单以连线标识"
    : "每位用户一列，订单按 Link 分组展示",
);

function fmtMoney(n: number) {
  return Math.floor(n).toLocaleString();
}

async function loadUsers() {
  try {
    users.value = await getAdminUsers(date.value);
  }
  catch {
    users.value = [];
  }
}

async function loadOrders() {
  loading.value = true;
  loadError.value = "";
  try {
    const page = await getAdminOrdersAll({
      date: date.value,
      provider: filterProvider.value || undefined,
    });
    orders.value = page.list ?? [];
  }
  catch (e) {
    orders.value = [];
    loadError.value = (e as Error).message || "加载失败";
  }
  finally {
    loading.value = false;
  }
}

async function refresh() {
  await Promise.all([loadUsers(), loadOrders()]);
}

function syncRouteQuery() {
  const query: Record<string, string> = { date: date.value };
  if (groupMode.value === "account")
    query.view = "account";
  if (filterUserId.value)
    query.userId = filterUserId.value;
  router.replace({
    name: "admin-orders",
    query,
  });
}

function onSearch() {
  syncRouteQuery();
  void loadOrders();
}

function onUserFilterChange(userId: string | null | undefined) {
  filterUserId.value = userId || "";
  syncRouteQuery();
}

async function onDeleteOrders(rows: AdminOrderRow[]) {
  if (!rows.length)
    return;
  const ids = rows.map(r => r.id);
  const label
    = rows.length > 1
      ? `这 ${rows.length} 笔套利订单（Link ${rows[0]?.linkId || "—"}）`
      : `订单 ${rows[0]?.orderId || ids[0]}`;
  try {
    await ElMessageBox.confirm(`确认删除 ${label}？此操作不可恢复。`, "删除订单", {
      type: "warning",
      confirmButtonText: "删除",
      cancelButtonText: "取消",
    });
  }
  catch {
    return;
  }
  try {
    const res = await deleteAdminOrders(ids);
    ElMessage.success(`已删除 ${res.deleted} 笔订单`);
    await loadOrders();
  }
  catch (e) {
    ElMessage.error((e as Error).message || "删除失败");
  }
}

watch(date, () => {
  syncRouteQuery();
  void refresh();
});

watch(groupMode, () => {
  syncRouteQuery();
});

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
  if (!userStore.canAccessAdmin) {
    await router.replace({ name: "home" });
    return;
  }
  await refresh();
});
</script>

<template>
  <AdminLayout title="订单查询" :subtitle="subtitle">
    <section v-loading="loading" class="admin-card admin-card--orders">
      <div class="admin-card__toolbar admin-orders-filters">
        <OrderDateNav v-model="date" placeholder="统计日期" />
        <el-radio-group v-model="groupMode" size="small">
          <el-radio-button value="user">
            按用户
          </el-radio-button>
          <el-radio-button value="account">
            按投注账号
          </el-radio-button>
        </el-radio-group>
        <el-select
          v-model="filterUserId"
          clearable
          filterable
          placeholder="筛选用户"
          size="small"
          style="width: 180px"
          @change="onUserFilterChange"
        >
          <el-option
            v-for="opt in userFilterOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
        <el-input
          v-model="filterProvider"
          clearable
          placeholder="平台 OB/RAY..."
          size="small"
          style="width: 120px"
          @keyup.enter="onSearch"
        />
        <el-button size="small" type="primary" @click="onSearch">
          查询
        </el-button>
        <el-button size="small" @click="date = todayKey()">
          今天
        </el-button>
        <el-button size="small" @click="refresh">
          刷新
        </el-button>
      </div>

      <div class="admin-card__body admin-orders-page__body">
        <p v-if="loadError" class="admin-order-groups__empty admin-order-groups__empty--err">
          {{ loadError }}
        </p>

        <div
          v-if="groupMode === 'user' && hasContent"
          class="admin-orders-by-user"
        >
          <AdminUserOrdersColumn
            v-for="col in userColumns"
            :key="col.userId"
            class="admin-orders-by-user__col"
            :user-name="col.userName"
            :accounts="col.accounts"
            :orders="col.orders"
            @delete="onDeleteOrders"
          />
        </div>

        <div
          v-else-if="groupMode === 'account' && hasContent"
          ref="columnsContainerRef"
          class="admin-orders-by-account"
        >
          <AdminAccountOrdersColumn
            v-for="col in accountColumns"
            :key="col.key"
            :provider="col.provider"
            :player-id="col.playerId"
            :player-name="col.playerName"
            :user-name="col.userName"
            :orders="col.orders"
            :accounts="col.accounts.length ? col.accounts : allAccounts"
            @delete="onDeleteOrders"
          />
          <AdminOrderLinkLines :container-ref="columnsContainerRef" :key="linkLinesKey" />
        </div>

        <p
          v-if="!loading && !loadError && !hasContent"
          class="admin-order-groups__empty"
        >
          {{ date }} 暂无订单。可切换日期查看；若应有数据仍为空，请确认服务器
          <code>GAMEBET_DB_SCRIPT=rds</code> 且已重启后端。
        </p>
      </div>

      <div v-if="hasContent" class="admin-orders-profit-summary">
        <span class="admin-orders-profit-summary__label">利润合计</span>
        <span
          class="admin-orders-profit-summary__value"
          :class="{ pos: profitTotal > 0, neg: profitTotal < 0 }"
        >
          {{ fmtMoney(profitTotal) }}
        </span>
        <span class="admin-orders-profit-summary__meta">
          <template v-if="groupMode === 'account'">
            {{ accountColumns.length }} 个账号 · {{ filteredOrders.length }} 笔订单
          </template>
          <template v-else>
            {{ userColumns.length }} 位用户 · {{ filteredOrders.length }} 笔订单
          </template>
        </span>
      </div>
    </section>
  </AdminLayout>
</template>
