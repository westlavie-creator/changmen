<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AdminLayout from "@/components/admin/AdminLayout.vue";
import OrderDateNav from "@/components/order/OrderDateNav.vue";
import { getAdminOrdersMatrix, getAdminUsers } from "@/api/admin";
import type { AdminOrderRow, AdminUserRow } from "@/types/admin";
import { todayKey } from "@/shared/dateKey";
import { useUserStore } from "@/stores/userStore";
import { formatDate, formatLinkId } from "@/shared/format";
import {
  buildAdminOrdersMatrix,
  linkGroupKey,
  type LinkMatrixRow,
  type LinkOrderGroup,
  type MatchGroup,
} from "@/shared/adminOrdersMatrix";

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

interface UserColumn {
  key: string;
  userId: string;
  label: string;
  orderCount: number;
}

interface MatrixDisplayRow {
  rowKey: string;
  group: MatchGroup;
  linkRow: LinkMatrixRow;
  cellsByUser: Record<string, LinkOrderGroup | null>;
  isFirstGroupRow: boolean;
  groupRowspan: number;
}

function linkGroupStatusClass(g: LinkOrderGroup) {
  const pending = g.rows.some((r) => String(r.status).toLowerCase() === "pending");
  if (pending) return "admin-matrix__order--pending";
  if (g.money > 0) return "admin-matrix__order--win";
  if (g.money < 0) return "admin-matrix__order--lose";
  const reject = g.rows.every((r) => String(r.status).toLowerCase() === "reject");
  if (reject) return "admin-matrix__order--reject";
  return "";
}

function linkGroupBadgeClass(g: LinkOrderGroup) {
  if (g.isLinked) return "admin-badge--linked";
  const s = String(g.rows[0]?.status || "").toLowerCase();
  return statusBadgeClass(s);
}

function linkGroupStatusLabel(g: LinkOrderGroup) {
  if (g.isLinked) return `套利 ${g.rows.length} 笔`;
  return g.rows[0]?.status || "—";
}

function linkIdLabel(g: LinkOrderGroup | null) {
  if (!g) return "—";
  return formatLinkId(g.linkId);
}

function fmtTime(ts: number) {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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

const userColumns = computed<UserColumn[]>(() => {
  const userNameById = new Map(users.value.map((u) => [u.id, u.userName]));
  const map = new Map<string, UserColumn>();
  const linkSeen = new Set<string>();

  for (const o of orders.value ?? []) {
    const key = o.userId;
    const linkSeenKey = `${key}::${linkGroupKey(o)}`;
    const existing = map.get(key);
    if (existing) {
      if (!linkSeen.has(linkSeenKey)) {
        linkSeen.add(linkSeenKey);
        existing.orderCount += 1;
      }
      continue;
    }
    linkSeen.add(linkSeenKey);
    const userName = userNameById.get(o.userId) || o.userId.slice(0, 8);
    map.set(key, {
      key,
      userId: o.userId,
      label: userName,
      orderCount: 1,
    });
  }

  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, "zh-CN"));
});

const matrixBuilt = computed(() => buildAdminOrdersMatrix(orders.value ?? []));

const linkGroupTotal = computed(() => matrixBuilt.value.linkGroupTotal);

const matchGroupCount = computed(() => matrixBuilt.value.matchGroups.length);

const matchGroups = computed(() => matrixBuilt.value.matchGroups);

const linkRowCount = computed(() =>
  matchGroups.value.reduce((sum, group) => sum + group.links.length, 0),
);

const matrixDisplayRows = computed<MatrixDisplayRow[]>(() => {
  const cols = userColumns.value;
  const rows: MatrixDisplayRow[] = [];
  for (const group of matchGroups.value) {
    const groupRowspan = group.links.length;
    let groupStarted = false;
    for (const linkRow of group.links) {
      const cellsByUser: Record<string, LinkOrderGroup | null> = {};
      for (const col of cols) {
        cellsByUser[col.key] = linkRow.cells[col.key] ?? null;
      }
      rows.push({
        rowKey: `${group.key}::lk${linkRow.key}`,
        group,
        linkRow,
        cellsByUser,
        isFirstGroupRow: !groupStarted,
        groupRowspan,
      });
      groupStarted = true;
    }
  }
  return rows;
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
    orders.value = data.list ?? [];
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
  <AdminLayout
    class="admin-shell--matrix"
    title="对阵矩阵"
    subtitle="纵向按比赛与 LinkID 展开，横向对比各用户；同一 LinkID 的双腿合并在同一格"
  >
    <section class="admin-card admin-orders-matrix" v-loading="loading">
      <div class="admin-card__toolbar admin-orders-filters">
        <OrderDateNav v-model="date" placeholder="统计日期" />
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
        <el-button size="small" @click="refresh">刷新</el-button>
        <span class="admin-orders-matrix__meta">
          {{ linkGroupTotal }} 组 · {{ orderTotal }} 笔 · {{ matchGroupCount }} 场 ·
          {{ linkRowCount }} 行 · {{ userColumns.length }} 个用户
        </span>
      </div>

      <div class="admin-card__body">
      <p v-if="loadError" class="admin-order-groups__empty admin-order-groups__empty--err">
        {{ loadError }}
      </p>

      <p v-else-if="!loading && !orders.length" class="admin-order-groups__empty">
        {{ date }} 暂无订单。可切换日期查看；若应有数据仍为空，请确认服务器
        <code>GAMEBET_DB_SCRIPT=rds</code> 且已重启后端。
      </p>

      <div v-else class="admin-matrix-wrap">
        <table class="admin-matrix">
          <thead>
            <tr>
              <th rowspan="2" class="admin-matrix__corner admin-matrix__corner--match">比赛</th>
              <th rowspan="2" class="admin-matrix__corner admin-matrix__corner--map">地图</th>
              <th rowspan="2" class="admin-matrix__corner admin-matrix__corner--bet">盘口</th>
              <th
                v-for="col in userColumns"
                :key="`${col.key}-head`"
                colspan="2"
                class="admin-matrix__col-head admin-matrix__col-head--player"
              >
                <div class="admin-matrix__player-name">{{ col.label }}</div>
                <div class="admin-matrix__match-count">{{ col.orderCount }} 组</div>
              </th>
            </tr>
            <tr>
              <template v-for="col in userColumns" :key="`${col.key}-sub`">
                <th class="admin-matrix__col-head admin-matrix__col-head--player-link">Link</th>
                <th class="admin-matrix__col-head admin-matrix__col-head--player-body">订单</th>
              </template>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in matrixDisplayRows"
              :key="row.rowKey"
              :class="{ 'admin-matrix__group-start': row.isFirstGroupRow }"
            >
              <th
                v-if="row.isFirstGroupRow"
                :rowspan="row.groupRowspan"
                class="admin-matrix__row-head admin-matrix__row-head--match"
                :title="row.group.label"
              >
                <div class="admin-matrix__match-cell">
                  <div class="admin-matrix__match-title">{{ row.group.label }}</div>
                  <div class="admin-matrix__match-meta">
                    <span v-if="row.group.matchId" class="admin-matrix__match-id">#{{ row.group.matchId }}</span>
                    <span v-if="row.group.matchStartTime">{{ formatDate(row.group.matchStartTime) }}</span>
                    <span>{{ row.group.orderCount }} 组</span>
                  </div>
                </div>
              </th>
              <th
                class="admin-matrix__row-head admin-matrix__row-head--map"
                :title="row.linkRow.mapLabel"
              >
                <span
                  class="admin-matrix__map-label"
                  :class="{ 'admin-matrix__map-label--full': row.linkRow.mapLabel === '全场' }"
                >{{ row.linkRow.mapLabel }}</span>
              </th>
              <th
                class="admin-matrix__row-head admin-matrix__row-head--bet"
                :title="row.linkRow.handicapLabel"
              >
                <span class="admin-matrix__handicap-label">{{ row.linkRow.handicapLabel }}</span>
              </th>
              <template v-for="col in userColumns" :key="col.key">
                <td class="admin-matrix__cell-link">
                  <span class="admin-matrix__link-id">
                    {{ linkIdLabel(row.cellsByUser[col.key]) }}
                  </span>
                </td>
                <td class="admin-matrix__cell">
                  <div
                    v-if="row.cellsByUser[col.key]"
                    class="admin-matrix__order"
                    :class="linkGroupStatusClass(row.cellsByUser[col.key]!)"
                  >
                    <div class="admin-matrix__order-top">
                      <span
                        v-if="row.cellsByUser[col.key]!.rows.length === 1"
                        class="admin-matrix__provider"
                      >
                        {{ row.cellsByUser[col.key]!.rows[0]?.provider }}
                      </span>
                      <span v-else class="admin-matrix__leg-count">
                        {{ row.cellsByUser[col.key]!.rows.length }} 笔
                      </span>
                      <span class="admin-matrix__time">{{ fmtTime(row.cellsByUser[col.key]!.createAt) }}</span>
                    </div>
                    <template v-if="row.cellsByUser[col.key]!.rows.length === 1">
                      <div class="admin-matrix__bet" :title="row.cellsByUser[col.key]!.rows[0].bet">
                        {{ row.cellsByUser[col.key]!.rows[0].bet }}
                      </div>
                      <div class="admin-matrix__item">
                        {{ row.cellsByUser[col.key]!.rows[0].item }}
                      </div>
                      <div class="admin-matrix__leg-nums">
                        赔 {{ row.cellsByUser[col.key]!.rows[0].odds }} · 投
                        {{ fmtMoney(row.cellsByUser[col.key]!.rows[0].betMoney) }}
                      </div>
                    </template>
                    <template v-else>
                      <div
                        v-for="o in row.cellsByUser[col.key]!.rows"
                        :key="o.id"
                        class="admin-matrix__leg"
                        :title="`${o.provider} ${o.bet} ${o.item}`"
                      >
                        <div class="admin-matrix__leg-head">
                          <span class="admin-matrix__provider">{{ o.provider }}</span>
                          <span class="admin-matrix__leg-item">{{ o.item }}</span>
                        </div>
                        <div class="admin-matrix__leg-nums">
                          赔 {{ o.odds }} · 投 {{ fmtMoney(o.betMoney) }}
                        </div>
                      </div>
                    </template>
                    <div class="admin-matrix__money">
                      <span>{{ row.cellsByUser[col.key]!.rows.length > 1 ? "合计投" : "投" }}
                        {{ fmtMoney(row.cellsByUser[col.key]!.betMoney) }}</span>
                      <span
                        :class="{
                          pos: row.cellsByUser[col.key]!.money > 0,
                          neg: row.cellsByUser[col.key]!.money < 0,
                        }"
                      >
                        {{ row.cellsByUser[col.key]!.money >= 0 ? "+" : "" }}
                        {{ fmtMoney(row.cellsByUser[col.key]!.money) }}
                      </span>
                    </div>
                    <div class="admin-matrix__status">
                      <span class="admin-badge" :class="linkGroupBadgeClass(row.cellsByUser[col.key]!)">
                        {{ linkGroupStatusLabel(row.cellsByUser[col.key]!) }}
                      </span>
                    </div>
                  </div>
                </td>
              </template>
            </tr>
          </tbody>
        </table>
      </div>
      </div>
    </section>
  </AdminLayout>
</template>
