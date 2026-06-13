<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AdminLayout from "@/components/admin/AdminLayout.vue";
import { getAdminOrdersMatrix, getAdminUsers } from "@/api/admin";
import type { AdminOrderRow, AdminUserRow } from "@/types/admin";
import { useUserStore } from "@/stores/userStore";
import { formatDate } from "@/shared/format";

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

const date = ref(String(route.query.date || todayKey()));
const filterProvider = ref("");
const loading = ref(false);
const orders = ref<AdminOrderRow[]>([]);
const orderTotal = ref(0);
const users = ref<AdminUserRow[]>([]);
const loadError = ref("");

interface PlayerColumn {
  key: string;
  userId: string;
  playerId: number;
  label: string;
  orderCount: number;
}

interface MatchRow {
  key: string;
  matchId: number;
  label: string;
  matchStartTime: number;
  orderCount: number;
  cells: Record<string, AdminOrderRow[]>;
}

function playerKey(o: AdminOrderRow) {
  return `${o.userId}:${o.playerId}`;
}

function matchKey(o: AdminOrderRow) {
  return o.matchKey || o.match || `o:${o.id}`;
}

function todayKey() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function shiftDateKey(key: string, deltaDays: number) {
  const parts = String(key || todayKey()).split("-").map(Number);
  if (parts.length < 3) return todayKey();
  const [y, m, d] = parts;
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

function fmtTime(ts: number) {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtMoney(n: number) {
  return Math.floor(n).toLocaleString();
}

function statusClass(status: string) {
  const s = status.toLowerCase();
  if (s === "win") return "admin-matrix__status--win";
  if (s === "lose") return "admin-matrix__status--lose";
  if (s === "reject") return "admin-matrix__status--reject";
  if (s === "pending") return "admin-matrix__status--pending";
  return "";
}

const playerLabelByKey = computed(() => {
  const map = new Map<string, string>();
  for (const u of users.value) {
    for (const acc of u.accounts || []) {
      const pid = Number(acc.accountId) || 0;
      if (!pid) continue;
      const parts = [
        acc.platform || acc.platformName,
        acc.playerName || acc.platformName,
      ].filter(Boolean);
      map.set(`${u.id}:${pid}`, parts.join(" · ") || `账号 ${pid}`);
    }
  }
  return map;
});

const playerColumns = computed<PlayerColumn[]>(() => {
  const userNameById = new Map(users.value.map((u) => [u.id, u.userName]));
  const map = new Map<string, PlayerColumn>();

  for (const o of orders.value) {
    const key = playerKey(o);
    const existing = map.get(key);
    if (existing) {
      existing.orderCount += 1;
      continue;
    }
    const userName = userNameById.get(o.userId) || o.userId.slice(0, 8);
    const playerLabel =
      playerLabelByKey.value.get(key) || (o.playerId ? `P${o.playerId}` : "默认");
    map.set(key, {
      key,
      userId: o.userId,
      playerId: o.playerId,
      label: `${userName}\n${playerLabel}`,
      orderCount: 1,
    });
  }

  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, "zh-CN"));
});

const matchRows = computed<MatchRow[]>(() => {
  const rowMap = new Map<string, MatchRow>();

  for (const o of orders.value) {
    const mKey = matchKey(o);
    if (!rowMap.has(mKey)) {
      rowMap.set(mKey, {
        key: mKey,
        matchId: o.matchId || 0,
        label: o.matchLabel || o.match || "—",
        matchStartTime: o.matchStartTime || 0,
        orderCount: 0,
        cells: {},
      });
    }
    const row = rowMap.get(mKey)!;
    if (!row.matchStartTime && o.matchStartTime) row.matchStartTime = o.matchStartTime;
    row.orderCount += 1;
    const pKey = playerKey(o);
    if (!row.cells[pKey]) row.cells[pKey] = [];
    row.cells[pKey].push(o);
  }

  for (const row of rowMap.values()) {
    for (const list of Object.values(row.cells)) {
      list.sort((a, b) => a.createAt - b.createAt);
    }
  }

  return [...rowMap.values()].sort((a, b) => {
    if (a.matchStartTime && b.matchStartTime && a.matchStartTime !== b.matchStartTime) {
      return a.matchStartTime - b.matchStartTime;
    }
    if (a.matchId && b.matchId && a.matchId !== b.matchId) return a.matchId - b.matchId;
    return a.label.localeCompare(b.label, "zh-CN");
  });
});

async function loadUsers() {
  try {
    users.value = await getAdminUsers(date.value);
  } catch {
    users.value = [];
  }
}

async function loadOrders() {
  loading.value = true;
  loadError.value = "";
  try {
    const data = await getAdminOrdersMatrix({
      date: date.value,
      provider: filterProvider.value || undefined,
    });
    orders.value = data.list;
    orderTotal.value = data.total;
  } catch (e) {
    orders.value = [];
    orderTotal.value = 0;
    loadError.value = (e as Error).message || "加载失败";
  } finally {
    loading.value = false;
  }
}

async function refresh() {
  await Promise.all([loadUsers(), loadOrders()]);
}

function syncRouteQuery() {
  router.replace({
    name: "admin-orders-matrix",
    query: { date: date.value },
  });
}

function onSearch() {
  syncRouteQuery();
  void loadOrders();
}

watch(date, () => {
  syncRouteQuery();
  void refresh();
});

onMounted(async () => {
  if (!userStore.ready) {
    try {
      await userStore.fetchUserInfo();
    } catch {
      sessionStorage.setItem("gamebet:postLoginRedirect", route.fullPath);
      await router.replace({ name: "home" });
      return;
    }
  }
  if (!userStore.isAdmin) {
    await router.replace({ name: "home" });
    return;
  }
  await refresh();
});
</script>

<template>
  <AdminLayout title="对阵订单">
    <section class="admin-orders-page admin-orders-matrix" v-loading="loading">
      <div class="admin-orders-filters">
        <el-date-picker
          v-model="date"
          type="date"
          value-format="YYYY-MM-DD"
          size="small"
          placeholder="统计日期"
          style="width: 150px"
        />
        <el-input
          v-model="filterProvider"
          clearable
          placeholder="平台 OB/RAY..."
          size="small"
          style="width: 120px"
          @keyup.enter="onSearch"
        />
        <el-button size="small" type="primary" @click="onSearch">查询</el-button>
        <el-button size="small" @click="date = todayKey()">今天</el-button>
        <el-button size="small" @click="date = shiftDateKey(date, -1)">昨天</el-button>
        <el-button size="small" @click="refresh">刷新</el-button>
        <span class="admin-orders-matrix__meta">
          {{ orderTotal }} 笔 · {{ matchRows.length }} 场比赛 · {{ playerColumns.length }} 个玩家
        </span>
      </div>

      <p v-if="loadError" class="admin-order-groups__empty admin-order-groups__empty--err">
        {{ loadError }}
      </p>

      <p v-else-if="!loading && !orders.length" class="admin-order-groups__empty">
        {{ date }} 暂无订单。可点「昨天」查看近期数据；若应有数据仍为空，请确认服务器
        <code>GAMEBET_DB_SCRIPT=rds</code> 且已重启后端。
      </p>

      <div v-else class="admin-matrix-scroll">
        <table class="admin-matrix">
          <thead>
            <tr>
              <th class="admin-matrix__corner">比赛</th>
              <th
                v-for="col in playerColumns"
                :key="col.key"
                class="admin-matrix__col-head admin-matrix__col-head--player"
              >
                <div class="admin-matrix__player-name">{{ col.label.split("\n")[0] }}</div>
                <div class="admin-matrix__player-account">{{ col.label.split("\n")[1] }}</div>
                <div class="admin-matrix__match-count">{{ col.orderCount }} 笔</div>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in matchRows" :key="row.key">
              <th class="admin-matrix__row-head admin-matrix__row-head--match" :title="row.label">
                <div v-if="row.matchId" class="admin-matrix__match-id">#{{ row.matchId }}</div>
                <div class="admin-matrix__match-title">{{ row.label }}</div>
                <div v-if="row.matchStartTime" class="admin-matrix__match-start">
                  {{ formatDate(row.matchStartTime) }}
                </div>
                <div class="admin-matrix__match-count">{{ row.orderCount }} 笔</div>
              </th>
              <td v-for="col in playerColumns" :key="col.key" class="admin-matrix__cell">
                <div
                  v-for="o in row.cells[col.key] || []"
                  :key="o.id"
                  class="admin-matrix__order"
                  :class="statusClass(o.status)"
                >
                  <div class="admin-matrix__order-top">
                    <span class="admin-matrix__provider">{{ o.provider }}</span>
                    <span class="admin-matrix__time">{{ fmtTime(o.createAt) }}</span>
                  </div>
                  <div class="admin-matrix__bet" :title="o.bet">{{ o.bet }}</div>
                  <div class="admin-matrix__item">{{ o.item }} @ {{ o.odds }}</div>
                  <div class="admin-matrix__money">
                    <span>投 {{ fmtMoney(o.betMoney) }}</span>
                    <span :class="{ pos: o.money > 0, neg: o.money < 0 }">
                      {{ o.money >= 0 ? "+" : "" }}{{ fmtMoney(o.money) }}
                    </span>
                  </div>
                  <div class="admin-matrix__status">{{ o.status }}</div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </AdminLayout>
</template>
