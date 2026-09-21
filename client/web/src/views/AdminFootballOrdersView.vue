<script setup lang="ts">
import type { AdminUserRow } from "@/types/admin";
import type { FootballOrderDto } from "@/api/footballOrder";
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { getAdminUsers } from "@/api/admin";
import { getAdminFootballOrders } from "@/api/footballOrder";
import AdminLayout from "@/components/admin/AdminLayout.vue";
import FootballOrderList from "@/components/football/FootballOrderList.vue";
import OrderDateNav from "@/components/order/OrderDateNav.vue";
import { todayKey } from "@/shared/dateKey";
import { compareAdminAccountKeys } from "@/shared/adminAccountSort";
import { footballOrderSettledProfit } from "@/runtime/podSportOrders";
import { useUserStore } from "@/stores/userStore";

type GroupMode = "user" | "account";

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

const date = ref(String(route.query.date || todayKey()));
const filterUserId = ref(String(route.query.userId || ""));
const groupMode = ref<GroupMode>(route.query.view === "account" ? "account" : "user");
const loading = ref(false);
const loadError = ref("");
const orders = ref<FootballOrderDto[]>([]);
const todayStake = ref(0);
const todayProfit = ref(0);
const profitLabel = computed(() => date.value === todayKey() ? "当日盈亏" : "利润合计");
const users = ref<AdminUserRow[]>([]);
const pageReady = ref(false);
const hScrollRef = ref<HTMLElement | null>(null);
const hScrollDragging = ref(false);
let loadSeq = 0;
let dragStartX = 0;
let dragStartScroll = 0;

function scrollOrdersBy(dx: number) {
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
  if (t instanceof Element && t.closest("button, a, input, textarea, select, .el-button"))
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
  catch { /* ignore */ }
}

function sumStake(list: FootballOrderDto[]) {
  return list.reduce((sum, row) => sum + (Number(row.stake) || 0), 0);
}

function sumProfit(list: FootballOrderDto[]) {
  return list.reduce((sum, row) => sum + footballOrderSettledProfit(row), 0);
}

function fmtMoney(n: number) {
  return Math.floor(n).toLocaleString();
}

function playerLabel(row: FootballOrderDto) {
  const venue = String(row.venue || "OB").trim();
  const name = String(row.accountName || "").trim();
  if (name)
    return `${venue} / ${name}`;
  const pid = Number(row.playerId) || 0;
  return pid ? `${venue} / #${pid}` : venue;
}

const userFilterOptions = computed(() =>
  [...users.value]
    .sort((a, b) => a.userName.localeCompare(b.userName, "zh-CN"))
    .map(u => ({
      value: u.id,
      label: `${u.userName}（${u.accounts?.length ?? 0} 账号）`,
    })),
);

const filteredOrders = computed(() => {
  if (!filterUserId.value)
    return orders.value;
  return orders.value.filter(row => String(row.userId) === filterUserId.value);
});

const userColumns = computed(() => {
  const byUser = new Map<string, FootballOrderDto[]>();
  for (const row of filteredOrders.value) {
    const uid = String(row.userId || "");
    const list = byUser.get(uid) ?? [];
    list.push(row);
    byUser.set(uid, list);
  }
  const userById = new Map(users.value.map(u => [u.id, u]));
  const sourceUsers = filterUserId.value
    ? users.value.filter(u => u.id === filterUserId.value)
    : users.value;
  const cols = sourceUsers.map(user => ({
    userId: user.id,
    userName: user.userName,
    orders: byUser.get(user.id) ?? [],
    stake: sumStake(byUser.get(user.id) ?? []),
    profit: sumProfit(byUser.get(user.id) ?? []),
  }));
  for (const [userId, userOrders] of byUser) {
    if (userById.has(userId))
      continue;
    cols.push({
      userId,
      userName: userOrders[0]?.userName || userId || "未知用户",
      orders: userOrders,
      stake: sumStake(userOrders),
      profit: sumProfit(userOrders),
    });
  }
  cols.sort((a, b) => a.userName.localeCompare(b.userName, "zh-CN"));
  return cols;
});

const accountColumns = computed(() => {
  const byAccount = new Map<string, FootballOrderDto[]>();
  for (const row of filteredOrders.value) {
    const key = String(row.playerId || row.accountName || row.userId || row.id);
    const list = byAccount.get(key) ?? [];
    list.push(row);
    byAccount.set(key, list);
  }
  return [...byAccount.entries()]
    .map(([key, list]) => {
      const first = list[0]!;
      return {
        key,
        title: playerLabel(first),
        userName: list[0]?.userName || "",
        orders: list,
        stake: sumStake(list),
        profit: sumProfit(list),
        sortKey: {
          userName: String(first.userName || ""),
          provider: String(first.venue || "OB"),
          playerName: String(first.accountName || ""),
          playerId: Number(first.playerId) || 0,
        },
      };
    })
    .sort((a, b) => compareAdminAccountKeys(a.sortKey, b.sortKey));
});

const hasContent = computed(() =>
  groupMode.value === "account"
    ? accountColumns.value.length > 0
    : userColumns.value.some(col => col.orders.length > 0) || userColumns.value.length > 0,
);

const subtitle = computed(() =>
  groupMode.value === "account"
    ? "按操盘账号分列 · OB 独立，其他场馆来自统一订单"
    : "每位用户一列 · OB 独立，其他场馆来自统一订单",
);

function syncQuery() {
  void router.replace({
    name: "admin-football-orders",
    query: {
      date: date.value,
      ...(groupMode.value === "account" ? { view: "account" } : {}),
      ...(filterUserId.value ? { userId: filterUserId.value } : {}),
    },
  });
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
  const seq = ++loadSeq;
  loading.value = true;
  loadError.value = "";
  try {
    const page = await getAdminFootballOrders({
      date: date.value,
      userId: filterUserId.value,
    });
    if (seq !== loadSeq)
      return;
    orders.value = page.list || [];
    todayStake.value = Number(page.todayStake) || 0;
    todayProfit.value = Number(page.todayProfit) || 0;
  }
  catch (err) {
    if (seq !== loadSeq)
      return;
    loadError.value = err instanceof Error ? err.message : String(err);
    orders.value = [];
    todayStake.value = 0;
    todayProfit.value = 0;
  }
  finally {
    if (seq === loadSeq)
      loading.value = false;
  }
}

async function refresh() {
  await Promise.all([loadUsers(), loadOrders()]);
}

watch(date, () => {
  if (!pageReady.value)
    return;
  syncQuery();
  void refresh();
});

watch([filterUserId, groupMode], () => {
  if (!pageReady.value)
    return;
  syncQuery();
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
  pageReady.value = true;
});
</script>

<template>
  <AdminLayout title="足球订单" :subtitle="subtitle">
    <section v-loading="loading" class="admin-card admin-card--orders">
      <div class="admin-card__toolbar admin-orders-filters">
        <OrderDateNav v-model="date" placeholder="统计日期" />
        <el-radio-group v-model="groupMode" size="small">
          <el-radio-button value="user">
            按用户
          </el-radio-button>
          <el-radio-button value="account">
            按操盘账号
          </el-radio-button>
        </el-radio-group>
        <el-select
          v-model="filterUserId"
          clearable
          filterable
          placeholder="筛选用户"
          size="small"
          style="width: 180px"
        >
          <el-option
            v-for="opt in userFilterOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
        <el-button size="small" type="primary" @click="loadOrders">
          查询
        </el-button>
        <el-button size="small" @click="date = todayKey()">
          今天
        </el-button>
        <el-button size="small" @click="refresh">
          刷新
        </el-button>
        <span v-if="hasContent" class="admin-orders-hscroll-btns">
          <el-button size="small" @click="scrollOrdersBy(-360)">
            ←
          </el-button>
          <el-button size="small" @click="scrollOrdersBy(360)">
            →
          </el-button>
        </span>
      </div>

      <div class="admin-card__body admin-orders-page__body">
        <p v-if="loadError" class="admin-order-groups__empty admin-order-groups__empty--err">
          {{ loadError }}
        </p>

        <div
          v-if="!loadError && hasContent"
          ref="hScrollRef"
          class="admin-orders-hscroll"
          :class="{ 'is-dragging': hScrollDragging }"
          @pointerdown="onHScrollPointerDown"
          @pointermove="onHScrollPointerMove"
          @pointerup="onHScrollPointerUp"
          @pointercancel="onHScrollPointerUp"
        >
          <div
            v-if="groupMode === 'user'"
            class="admin-orders-by-user"
          >
            <div
              v-for="col in userColumns"
              :key="col.userId"
              class="admin-orders-user-col admin-orders-by-user__col"
            >
              <header class="admin-orders-user-col__head">
                <div class="admin-orders-user-col__title-row">
                  <h3 class="admin-orders-user-col__name">
                    {{ col.userName }}
                  </h3>
                </div>
                <span class="admin-orders-user-col__profit">
                  {{ fmtMoney(col.profit) }}
                </span>
                <span class="admin-orders-user-col__meta">{{ col.orders.length }} 笔 · 已下 {{ fmtMoney(col.stake) }}</span>
              </header>
              <div v-if="!col.orders.length" class="admin-orders-user-col__empty">
                暂无订单
              </div>
              <div v-else class="admin-orders-user-col__list">
                <FootballOrderList :rows="col.orders" :player-label="playerLabel" />
              </div>
            </div>
          </div>

          <div
            v-else
            class="admin-orders-by-account"
          >
            <div
              v-for="col in accountColumns"
              :key="col.key"
              class="admin-orders-account-col"
            >
              <header class="admin-orders-account-col__head">
                <div class="admin-orders-account-col__title">
                  <h3 class="admin-orders-account-col__name" :title="col.title">
                    {{ col.title }}
                  </h3>
                </div>
                <div class="admin-orders-account-col__stats">
                  <span class="admin-orders-account-col__profit">
                    {{ fmtMoney(col.profit) }}
                  </span>
                  <span class="admin-orders-account-col__meta">{{ col.orders.length }} 笔 · 已下 {{ fmtMoney(col.stake) }} · {{ col.userName }}</span>
                </div>
              </header>
              <div class="admin-orders-account-col__list">
                <FootballOrderList :rows="col.orders" :player-label="playerLabel" />
              </div>
            </div>
          </div>
        </div>

        <p
          v-if="!loading && !loadError && !filteredOrders.length && (groupMode === 'account' || !users.length)"
          class="admin-order-groups__empty"
        >
          {{ date }} 暂无足球订单。可切换日期查看；OB 读 football_orders，其他场馆读统一 orders。
        </p>
      </div>

      <div v-if="filteredOrders.length" class="admin-orders-profit-summary">
        <span class="admin-orders-profit-summary__label">{{ profitLabel }}</span>
        <span class="admin-orders-profit-summary__value">
          {{ fmtMoney(todayProfit) }}
        </span>
        <span class="admin-orders-profit-summary__meta">
          已下 {{ fmtMoney(todayStake) }}
          ·
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
