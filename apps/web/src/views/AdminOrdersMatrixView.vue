<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AdminLayout from "@/components/admin/AdminLayout.vue";
import { getAdminOrdersMatrix, getAdminUsers } from "@/api/admin";
import type { AdminOrderRow, AdminUserRow } from "@/types/admin";
import { useUserStore } from "@/stores/userStore";
import { formatDate, formatLinkId, isSingleLegLink } from "@/shared/format";

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

interface LinkOrderGroup {
  key: number;
  linkId: number;
  rows: AdminOrderRow[];
  createAt: number;
  betMoney: number;
  money: number;
  isLinked: boolean;
}

interface BetRow {
  key: string;
  betLabel: string;
  betSort: number;
  orderCount: number;
  cells: Record<string, LinkOrderGroup[]>;
}

interface MatchGroup {
  key: string;
  matchId: number;
  label: string;
  matchStartTime: number;
  orderCount: number;
  bets: BetRow[];
}

interface BetMapInfo {
  key: string;
  label: string;
  sort: number;
}

/** 从订单盘口名解析地图（全场 / 地图N） */
function parseBetMap(bet: string): BetMapInfo {
  const s = String(bet || "").trim();
  if (!s) return { key: "other", label: "其他", sort: 99 };

  const bracketMap = /\[地图\s*(\d+)\]/i.exec(s);
  if (bracketMap) {
    const n = Number(bracketMap[1]);
    return { key: `m${n}`, label: `地图${n}`, sort: n };
  }

  const plainMap = /地图\s*(\d+)/i.exec(s);
  if (plainMap) {
    const n = Number(plainMap[1]);
    return { key: `m${n}`, label: `地图${n}`, sort: n };
  }

  const enMap = /\bMap\s*(\d+)\b/i.exec(s);
  if (enMap) {
    const n = Number(enMap[1]);
    return { key: `m${n}`, label: `地图${n}`, sort: n };
  }

  if (/全场胜负/.test(s) || /\[全场\]/i.test(s) || /^全场\b/i.test(s)) {
    return { key: "m0", label: "全场", sort: 0 };
  }

  return { key: "other", label: s.length > 14 ? `${s.slice(0, 14)}…` : s, sort: 50 };
}

function baseMatchKey(o: AdminOrderRow) {
  return o.matchKey || o.match || `o:${o.id}`;
}

function normalizeBet(bet: string) {
  return String(bet || "").trim() || "—";
}

function matrixRowKey(o: AdminOrderRow) {
  return `${baseMatchKey(o)}::${normalizeBet(o.bet)}`;
}

/** 矩阵横向列：按登录用户，不按投注账号 */
function userColumnKey(o: AdminOrderRow) {
  return o.userId;
}

/** 同 LinkID 为一组；无 link 时按行 id 单独成组（与订单查询页一致） */
function linkGroupKey(o: AdminOrderRow) {
  return o.linkId || o.id;
}

function buildLinkGroups(rows: AdminOrderRow[]): LinkOrderGroup[] {
  const map = new Map<number, AdminOrderRow[]>();
  for (const o of rows) {
    const k = linkGroupKey(o);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(o);
  }
  return [...map.entries()]
    .map(([key, groupRows]) => {
      const sorted = [...groupRows].sort((a, b) => a.createAt - b.createAt);
      const linkId = sorted[0].linkId || 0;
      return {
        key,
        linkId,
        rows: sorted,
        createAt: sorted[0].createAt,
        betMoney: sorted.reduce((s, r) => s + (Number(r.betMoney) || 0), 0),
        money: sorted.reduce((s, r) => s + (Number(r.money) || 0), 0),
        isLinked: linkId !== 0 && !isSingleLegLink(linkId) && sorted.length > 1,
      };
    })
    .sort((a, b) => a.createAt - b.createAt);
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

function linkKeysForBetRow(betRow: BetRow): number[] {
  const meta = new Map<number, number>();
  for (const groups of Object.values(betRow.cells)) {
    for (const g of groups) {
      if (!meta.has(g.key)) meta.set(g.key, g.createAt);
    }
  }
  return [...meta.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([key]) => key);
}

function linkGroupForUser(betRow: BetRow, userColKey: string, linkKey: number) {
  return (betRow.cells[userColKey] || []).find((g) => g.key === linkKey) || null;
}

function linkIdLabel(g: LinkOrderGroup | null) {
  if (!g) return "—";
  return formatLinkId(g.linkId);
}

interface MatrixDisplayRow {
  rowKey: string;
  group: MatchGroup;
  betRow: BetRow;
  linkKey: number;
  cellsByUser: Record<string, LinkOrderGroup | null>;
  isFirstGroupRow: boolean;
  isFirstBetRow: boolean;
  groupRowspan: number;
  betRowspan: number;
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
    const key = userColumnKey(o);
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

const linkGroupTotal = computed(() => {
  const keys = new Set<number>();
  for (const o of orders.value ?? []) keys.add(linkGroupKey(o));
  return keys.size;
});

const matchGroupCount = computed(() => {
  const bases = new Set<string>();
  for (const o of orders.value ?? []) bases.add(baseMatchKey(o));
  return bases.size;
});

const matchGroups = computed<MatchGroup[]>(() => {
  type BetRowBuild = BetRow & { baseKey: string; rawCells: Record<string, AdminOrderRow[]> };
  const betRowMap = new Map<string, BetRowBuild>();
  const groupMeta = new Map<
    string,
    { matchId: number; label: string; matchStartTime: number; linkKeys: Set<number> }
  >();

  for (const o of orders.value ?? []) {
    const betLabel = normalizeBet(o.bet);
    const betSort = parseBetMap(o.bet).sort;
    const baseKey = baseMatchKey(o);
    const rowKey = matrixRowKey(o);

    if (!groupMeta.has(baseKey)) {
      groupMeta.set(baseKey, {
        matchId: o.matchId || 0,
        label: o.matchLabel || o.match || "—",
        matchStartTime: o.matchStartTime || 0,
        linkKeys: new Set(),
      });
    }
    const meta = groupMeta.get(baseKey)!;
    if (!meta.matchStartTime && o.matchStartTime) meta.matchStartTime = o.matchStartTime;
    meta.linkKeys.add(linkGroupKey(o));

    if (!betRowMap.has(rowKey)) {
      betRowMap.set(rowKey, {
        key: rowKey,
        baseKey,
        betLabel,
        betSort,
        orderCount: 0,
        cells: {},
        rawCells: {},
      });
    }
    const row = betRowMap.get(rowKey)!;
    const uKey = userColumnKey(o);
    if (!row.rawCells[uKey]) row.rawCells[uKey] = [];
    row.rawCells[uKey].push(o);
  }

  for (const row of betRowMap.values()) {
    const linkKeys = new Set<number>();
    row.cells = {};
    for (const [pKey, list] of Object.entries(row.rawCells)) {
      row.cells[pKey] = buildLinkGroups(list);
      for (const g of row.cells[pKey]) linkKeys.add(g.key);
    }
    row.orderCount = linkKeys.size;
  }

  const groupMap = new Map<string, MatchGroup>();
  for (const row of betRowMap.values()) {
    const meta = groupMeta.get(row.baseKey)!;
    if (!groupMap.has(row.baseKey)) {
      groupMap.set(row.baseKey, {
        key: row.baseKey,
        matchId: meta.matchId,
        label: meta.label,
        matchStartTime: meta.matchStartTime,
        orderCount: meta.linkKeys.size,
        bets: [],
      });
    }
    const { rawCells: _raw, baseKey: _base, ...betRow } = row;
    groupMap.get(row.baseKey)!.bets.push(betRow);
  }

  for (const group of groupMap.values()) {
    group.bets.sort((a, b) => {
      if (a.betSort !== b.betSort) return a.betSort - b.betSort;
      return a.betLabel.localeCompare(b.betLabel, "zh-CN");
    });
  }

  return [...groupMap.values()].sort((a, b) => {
    if (a.matchStartTime && b.matchStartTime && a.matchStartTime !== b.matchStartTime) {
      return a.matchStartTime - b.matchStartTime;
    }
    if (a.matchId && b.matchId && a.matchId !== b.matchId) return a.matchId - b.matchId;
    return a.label.localeCompare(b.label, "zh-CN");
  });
});

const betRowCount = computed(() =>
  matchGroups.value.reduce((sum, group) => sum + group.bets.length, 0)
);

const matrixDisplayRows = computed<MatrixDisplayRow[]>(() => {
  const cols = userColumns.value;
  const rows: MatrixDisplayRow[] = [];
  for (const group of matchGroups.value) {
    const groupRowspan = group.bets.reduce(
      (sum, bet) => sum + Math.max(linkKeysForBetRow(bet).length, 1),
      0
    );
    let groupStarted = false;
    for (const betRow of group.bets) {
      const linkKeys = linkKeysForBetRow(betRow);
      const keys = linkKeys.length ? linkKeys : [0];
      const betRowspan = Math.max(linkKeys.length, 1);
      keys.forEach((linkKey, linkIdx) => {
        const cellsByUser: Record<string, LinkOrderGroup | null> = {};
        for (const col of cols) {
          cellsByUser[col.key] = linkGroupForUser(betRow, col.key, linkKey);
        }
        rows.push({
          rowKey: `${betRow.key}::${linkKey}`,
          group,
          betRow,
          linkKey,
          cellsByUser,
          isFirstGroupRow: !groupStarted,
          isFirstBetRow: linkIdx === 0,
          groupRowspan,
          betRowspan,
        });
        groupStarted = true;
      });
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
  <AdminLayout title="对阵矩阵" subtitle="比赛纵向排列，同场盘口在左侧合并展示">
    <section class="admin-card admin-orders-matrix" v-loading="loading">
      <div class="admin-card__toolbar admin-orders-filters">
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
          {{ linkGroupTotal }} 组 · {{ orderTotal }} 笔 · {{ matchGroupCount }} 场 ·
          {{ betRowCount }} 盘口 · {{ userColumns.length }} 个用户
        </span>
      </div>

      <div class="admin-card__body">
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
              <th rowspan="2" class="admin-matrix__corner admin-matrix__corner--match">比赛</th>
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
                <div class="admin-matrix__head-center">
                  <div v-if="row.group.matchId" class="admin-matrix__match-id">#{{ row.group.matchId }}</div>
                  <div class="admin-matrix__match-title">{{ row.group.label }}</div>
                  <div v-if="row.group.matchStartTime" class="admin-matrix__match-start">
                    {{ formatDate(row.group.matchStartTime) }}
                  </div>
                  <div class="admin-matrix__match-count">
                    {{ row.group.orderCount }} 组 · {{ row.group.bets.length }} 盘口
                  </div>
                </div>
              </th>
              <th
                v-if="row.isFirstBetRow"
                :rowspan="row.betRowspan"
                class="admin-matrix__row-head admin-matrix__row-head--bet"
                :title="row.betRow.betLabel"
              >
                <div class="admin-matrix__head-center">
                  <span class="admin-matrix__bet-label">{{ row.betRow.betLabel }}</span>
                  <div class="admin-matrix__match-count">{{ row.betRow.orderCount }} 组</div>
                </div>
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
                      <span class="admin-matrix__provider">{{ row.cellsByUser[col.key]!.rows[0]?.provider }}</span>
                      <span class="admin-matrix__time">{{ fmtTime(row.cellsByUser[col.key]!.createAt) }}</span>
                    </div>
                    <template v-if="row.cellsByUser[col.key]!.rows.length === 1">
                      <div class="admin-matrix__bet" :title="row.cellsByUser[col.key]!.rows[0].bet">
                        {{ row.cellsByUser[col.key]!.rows[0].bet }}
                      </div>
                      <div class="admin-matrix__item">
                        {{ row.cellsByUser[col.key]!.rows[0].item }} @
                        {{ row.cellsByUser[col.key]!.rows[0].odds }}
                      </div>
                    </template>
                    <template v-else>
                      <div
                        v-for="o in row.cellsByUser[col.key]!.rows"
                        :key="o.id"
                        class="admin-matrix__leg"
                        :title="`${o.provider} ${o.bet} ${o.item}`"
                      >
                        <span class="admin-matrix__provider">{{ o.provider }}</span>
                        <span class="admin-matrix__leg-item">{{ o.item }} @ {{ o.odds }}</span>
                      </div>
                    </template>
                    <div class="admin-matrix__money">
                      <span>投 {{ fmtMoney(row.cellsByUser[col.key]!.betMoney) }}</span>
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
