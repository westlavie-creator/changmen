<script setup lang="ts">
import { computed } from "vue";
import type { AdminOrderRow } from "@/types/admin";
import { classifyLinkId, formatLinkId, isSingleLegLink, linkIdSourceLabel } from "@/shared/format";

const props = defineProps<{
  groups: [number, AdminOrderRow[]][];
  showUserColumn?: boolean;
  userNameById?: Map<string, string>;
}>();

interface OrderGroupRow {
  id: string;
  key: number;
  rows: AdminOrderRow[];
  linkId: number;
}

const tableRows = computed<OrderGroupRow[]>(() =>
  props.groups.map(([key, rows]) => {
    const sorted = [...rows].sort((a, b) => a.createAt - b.createAt);
    return {
      id: `group-${key}`,
      key,
      rows: sorted,
      linkId: sorted[0]?.linkId || 0,
    };
  }),
);

function linkSourceTag(linkId: number | undefined) {
  const source = classifyLinkId(linkId);
  const label = linkIdSourceLabel(source);
  if (!source || !label) return null;
  const title =
    source === "external"
      ? "官网/外部下单，link 为 orderId hash"
      : source === "arb"
        ? "系统内套利 SaveOrderBind"
        : "系统内单边下单";
  return { source, label, title };
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

function userLabel(row: AdminOrderRow) {
  return props.userNameById?.get(row.userId) || row.userId.slice(0, 8);
}

function rowClassName({ row }: { row: OrderGroupRow }) {
  return groupIsLinked(row.rows)
    ? "admin-order-group-row admin-order-group-row--paired"
    : "admin-order-group-row";
}
</script>

<template>
  <el-table
    :data="tableRows"
    row-key="id"
    size="small"
    stripe
    class="admin-orders-el-table"
    :row-class-name="rowClassName"
  >
    <el-table-column label="LinkID" width="168" fixed="left" show-overflow-tooltip>
      <template #default="{ row }">
        <div class="admin-order-link-cell">
          <div class="admin-order-link-cell__id">{{ formatLinkId(row.linkId) }}</div>
          <div class="admin-order-link-cell__meta">
            <span
              v-for="src in [linkSourceTag(row.linkId)].filter(Boolean)"
              :key="src!.source"
              class="admin-link-source"
              :class="`admin-link-source--${src!.source}`"
              :title="src!.title"
            >{{ src!.label }}</span>
            <span
              class="admin-order-group-bar__type"
              :class="{ 'admin-order-group-bar__type--arb': groupIsLinked(row.rows) }"
            >
              {{ groupMetaLabel(row.rows) }}
            </span>
          </div>
        </div>
      </template>
    </el-table-column>
    <el-table-column label="OrderID" min-width="168" show-overflow-tooltip>
      <template #default="{ row }">
        <div class="admin-order-stack">
          <div v-for="o in row.rows" :key="o.id" class="admin-order-stack__line">
            <span class="admin-order-mono">{{ o.orderId || "—" }}</span>
          </div>
        </div>
      </template>
    </el-table-column>
    <el-table-column v-if="showUserColumn" label="用户" width="100" show-overflow-tooltip>
      <template #default="{ row }">
        <div class="admin-order-stack">
          <div v-for="o in row.rows" :key="o.id" class="admin-order-stack__line">
            {{ userLabel(o) }}
          </div>
        </div>
      </template>
    </el-table-column>
    <el-table-column label="平台" width="72" align="center">
      <template #default="{ row }">
        <div class="admin-order-stack">
          <div v-for="o in row.rows" :key="o.id" class="admin-order-stack__line">
            <span class="admin-order-provider">{{ o.provider }}</span>
          </div>
        </div>
      </template>
    </el-table-column>
    <el-table-column label="比赛" min-width="160" show-overflow-tooltip>
      <template #default="{ row }">
        <div class="admin-order-stack">
          <div v-for="o in row.rows" :key="o.id" class="admin-order-stack__line">{{ o.match }}</div>
        </div>
      </template>
    </el-table-column>
    <el-table-column label="盘口" min-width="140" show-overflow-tooltip>
      <template #default="{ row }">
        <div class="admin-order-stack">
          <div v-for="o in row.rows" :key="o.id" class="admin-order-stack__line">{{ o.bet }}</div>
        </div>
      </template>
    </el-table-column>
    <el-table-column label="选项" width="100" show-overflow-tooltip>
      <template #default="{ row }">
        <div class="admin-order-stack">
          <div v-for="o in row.rows" :key="o.id" class="admin-order-stack__line">{{ o.item }}</div>
        </div>
      </template>
    </el-table-column>
    <el-table-column label="赔率" width="72" align="right">
      <template #default="{ row }">
        <div class="admin-order-stack admin-order-stack--num">
          <div v-for="o in row.rows" :key="o.id" class="admin-order-stack__line">
            <span class="admin-order-num">{{ o.odds }}</span>
          </div>
        </div>
      </template>
    </el-table-column>
    <el-table-column label="投注" width="88" align="right">
      <template #default="{ row }">
        <div class="admin-order-stack admin-order-stack--num">
          <div v-for="o in row.rows" :key="o.id" class="admin-order-stack__line">
            <span class="admin-order-num">{{ fmtMoney(o.betMoney) }}</span>
          </div>
        </div>
      </template>
    </el-table-column>
    <el-table-column label="盈利" width="96" align="right">
      <template #default="{ row }">
        <div class="admin-order-stack admin-order-stack--num">
          <div v-for="o in row.rows" :key="o.id" class="admin-order-stack__line">
            <span class="admin-order-num" :class="{ pos: o.money > 0, neg: o.money < 0 }">
              {{ fmtMoney(o.money) }}
            </span>
          </div>
          <div
            v-if="row.rows.length > 1"
            class="admin-order-stack__sum"
            :class="groupProfitClass(row.rows)"
          >
            合计 {{ fmtMoney(groupProfit(row.rows)) }}
          </div>
        </div>
      </template>
    </el-table-column>
    <el-table-column label="状态" width="88" align="center">
      <template #default="{ row }">
        <div class="admin-order-stack">
          <div v-for="o in row.rows" :key="o.id" class="admin-order-stack__line">
            <span class="admin-badge" :class="statusBadgeClass(o.status)">{{ o.status }}</span>
          </div>
        </div>
      </template>
    </el-table-column>
    <el-table-column label="时间" width="160" show-overflow-tooltip>
      <template #default="{ row }">
        <div class="admin-order-stack">
          <div v-for="o in row.rows" :key="o.id" class="admin-order-stack__line admin-order-time">
            {{ fmtTime(o.createAt) }}
          </div>
        </div>
      </template>
    </el-table-column>
  </el-table>
</template>
