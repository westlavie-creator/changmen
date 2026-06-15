<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AdminLayout from "@/components/admin/AdminLayout.vue";
import { getAdminOrders, getAdminUsers } from "@/api/admin";
import type { AdminOrderRow, AdminUserRow } from "@/types/admin";
import { formatLinkId, isSingleLegLink } from "@/shared/format";
import { useUserStore } from "@/stores/userStore";

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

const date = ref(String(route.query.date || todayKey()));
const filterUserId = ref(String(route.query.userId || ""));
const filterProvider = ref("");
const loading = ref(false);
const orders = ref<AdminOrderRow[]>([]);
const orderTotal = ref(0);
const orderPage = ref(1);
const orderPageSize = ref(50);
const users = ref<AdminUserRow[]>([]);
const loadError = ref("");

const filterUserName = computed(() => {
  const fromQuery = String(route.query.userName || "");
  if (fromQuery) return fromQuery;
  return users.value.find((u) => u.id === filterUserId.value)?.userName || "";
});

const pageTitle = computed(() =>
  filterUserId.value
    ? `${filterUserName.value || "用户"} · 当日订单`
    : "全部订单",
);

const userNameById = computed(() => {
  const map = new Map<string, string>();
  for (const u of users.value) map.set(u.id, u.userName);
  return map;
});

/** 同 LinkID 订单归为一组（无 link 时按行 id 单独成组） */
const orderGroups = computed(() => {
  const map = new Map<number, AdminOrderRow[]>();
  for (const row of orders.value ?? []) {
    const key = row.linkId || row.id;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  }
  return [...map.entries()].sort((a, b) => {
    const ta = Math.max(...a[1].map((r) => r.createAt));
    const tb = Math.max(...b[1].map((r) => r.createAt));
    return tb - ta;
  });
});

function groupLinkLabel(rows: AdminOrderRow[]) {
  return formatLinkId(rows[0]?.linkId);
}

function groupIsLinked(rows: AdminOrderRow[]) {
  const link = Number(rows[0]?.linkId) || 0;
  return link !== 0 && !isSingleLegLink(link) && rows.length > 1;
}

function groupMetaLabel(rows: AdminOrderRow[]) {
  const link = Number(rows[0]?.linkId) || 0;
  if (isSingleLegLink(link)) return "单边";
  if (groupIsLinked(rows)) return `套利 ${rows.length} 笔`;
  return "单笔";
}

function groupProfit(rows: AdminOrderRow[]) {
  return rows.reduce((sum, r) => sum + (Number(r.money) || 0), 0);
}

function groupProfitClass(rows: AdminOrderRow[]) {
  const total = groupProfit(rows);
  if (total === 0) return "";
  return total > 0 ? "pos" : "neg";
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
  return new Date(ts).toLocaleString();
}

function fmtMoney(n: number) {
  return Math.floor(n).toLocaleString();
}

function statusBadgeClass(status: string) {
  const s = status.toLowerCase();
  if (s === "win") return "admin-badge--win";
  if (s === "lose") return "admin-badge--lose";
  if (s === "reject") return "admin-badge--reject";
  if (s === "pending") return "admin-badge--pending";
  return "";
}

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
    const page = await getAdminOrders({
      date: date.value,
      pageIndex: orderPage.value,
      pageSize: orderPageSize.value,
      userId: filterUserId.value || undefined,
      provider: filterProvider.value || undefined,
    });
    orders.value = page.list ?? [];
    orderTotal.value = page.total;
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
    name: "admin-orders",
    query: {
      ...(filterUserId.value ? { userId: filterUserId.value } : {}),
      ...(filterUserName.value ? { userName: filterUserName.value } : {}),
      date: date.value,
    },
  });
}

function onSearch() {
  orderPage.value = 1;
  syncRouteQuery();
  void loadOrders();
}

watch(date, () => {
  orderPage.value = 1;
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
  <AdminLayout :title="pageTitle" subtitle="按日期、用户与平台筛选订单">
    <section class="admin-card" v-loading="loading">
        <div class="admin-card__toolbar admin-orders-filters">
          <el-date-picker
            v-model="date"
            type="date"
            value-format="YYYY-MM-DD"
            size="small"
            placeholder="统计日期"
            style="width: 150px"
          />
          <el-select
            v-model="filterUserId"
            clearable
            filterable
            placeholder="用户"
            size="small"
            style="width: 180px"
            @change="onSearch"
          >
            <el-option
              v-for="u in users"
              :key="u.id"
              :label="u.userName"
              :value="u.id"
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
          <el-button size="small" type="primary" @click="onSearch">查询</el-button>
          <el-button size="small" @click="date = todayKey()">今天</el-button>
          <el-button size="small" @click="date = shiftDateKey(date, -1)">昨天</el-button>
          <el-button size="small" @click="refresh">刷新</el-button>
        </div>
        <div class="admin-card__body">
        <p v-if="loadError" class="admin-order-groups__empty admin-order-groups__empty--err">
          {{ loadError }}
        </p>
        <div class="admin-order-groups">
          <section
            v-for="[groupKey, groupRows] in orderGroups"
            :key="groupKey"
            class="admin-order-link"
            :class="{ 'admin-order-link--paired': groupIsLinked(groupRows) }"
          >
            <header class="admin-order-link__head">
              <span class="admin-order-link__id">Link {{ groupLinkLabel(groupRows) }}</span>
              <span v-if="groupIsLinked(groupRows)" class="admin-order-link__meta">套利 {{ groupRows.length }} 笔</span>
              <span v-else class="admin-order-link__meta">{{ groupMetaLabel(groupRows) }}</span>
              <span class="admin-order-link__order-ids" :title="groupRows.map((r) => r.orderId).join(', ')">
                OrderID {{ groupRows.map((r) => r.orderId).filter(Boolean).join(' · ') || '—' }}
              </span>
              <span class="admin-order-link__profit" :class="groupProfitClass(groupRows)">
                合计 {{ fmtMoney(groupProfit(groupRows)) }}
              </span>
            </header>
            <el-table :data="groupRows" size="small" class="admin-order-link__table">
              <el-table-column label="OrderID" min-width="168" show-overflow-tooltip>
                <template #default="{ row }">{{ row.orderId || '—' }}</template>
              </el-table-column>
              <el-table-column label="LinkID" width="108" show-overflow-tooltip>
                <template #default="{ row }">{{ formatLinkId(row.linkId) }}</template>
              </el-table-column>
              <el-table-column v-if="!filterUserId" label="用户" width="100">
                <template #default="{ row }">
                  {{ userNameById.get(row.userId) || row.userId.slice(0, 8) }}
                </template>
              </el-table-column>
              <el-table-column prop="provider" label="平台" width="70" />
              <el-table-column prop="match" label="比赛" min-width="160" show-overflow-tooltip />
              <el-table-column prop="bet" label="盘口" min-width="140" show-overflow-tooltip />
              <el-table-column prop="item" label="选项" width="100" show-overflow-tooltip />
              <el-table-column prop="odds" label="赔率" width="70" />
              <el-table-column label="投注" width="88">
                <template #default="{ row }">{{ fmtMoney(row.betMoney) }}</template>
              </el-table-column>
              <el-table-column label="盈利" width="88">
                <template #default="{ row }">
                  <span :class="{ pos: row.money > 0, neg: row.money < 0 }">{{ fmtMoney(row.money) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="状态" width="88">
                <template #default="{ row }">
                  <span class="admin-badge" :class="statusBadgeClass(row.status)">{{ row.status }}</span>
                </template>
              </el-table-column>
              <el-table-column label="时间" width="160">
                <template #default="{ row }">{{ fmtTime(row.createAt) }}</template>
              </el-table-column>
            </el-table>
          </section>
          <p v-if="!loading && !loadError && !orderGroups.length" class="admin-order-groups__empty">
            {{ date }} 暂无订单。可点「昨天」查看近期数据；若应有数据仍为空，请确认服务器
            <code>GAMEBET_DB_SCRIPT=rds</code> 且已重启后端。
          </p>
        </div>
        <div class="admin-orders-pager">
          <el-pagination
            v-model:current-page="orderPage"
            :page-size="orderPageSize"
            :total="orderTotal"
            layout="total, prev, pager, next"
            small
            @current-change="loadOrders"
          />
        </div>
        </div>
      </section>
  </AdminLayout>
</template>
