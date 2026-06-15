<script setup lang="ts">
import { computed } from "vue";
import type { AdminOrderRow } from "@/types/admin";
import { classifyLinkId, formatLinkId, isSingleLegLink, linkIdSourceLabel } from "@/shared/format";

const props = defineProps<{
  groups: [number, AdminOrderRow[]][];
  showUserColumn?: boolean;
  userNameById?: Map<string, string>;
}>();

type GroupHeadRow = {
  id: string;
  _isGroupHead: true;
  _groupRows: AdminOrderRow[];
};

type TableRow = AdminOrderRow | GroupHeadRow;

function isGroupHead(row: TableRow): row is GroupHeadRow {
  return "_isGroupHead" in row && row._isGroupHead === true;
}

const flatRows = computed(() => {
  const out: TableRow[] = [];
  for (const [key, rows] of props.groups) {
    out.push({ id: `group-${key}`, _isGroupHead: true, _groupRows: rows });
    out.push(...rows);
  }
  return out;
});

const colCount = computed(() => (props.showUserColumn ? 12 : 11));

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

function spanMethod({
  row,
  columnIndex,
}: {
  row: TableRow;
  columnIndex: number;
}) {
  if (!isGroupHead(row)) return { rowspan: 1, colspan: 1 };
  if (columnIndex === 0) return { rowspan: 1, colspan: colCount.value };
  return { rowspan: 0, colspan: 0 };
}

function rowClassName({ row }: { row: TableRow }) {
  if (!isGroupHead(row)) return "admin-order-data-row";
  return groupIsLinked(row._groupRows)
    ? "admin-order-group-row admin-order-group-row--paired"
    : "admin-order-group-row";
}
</script>

<template>
  <el-table
    :data="flatRows"
    row-key="id"
    size="small"
    stripe
    class="admin-orders-el-table"
    :span-method="spanMethod"
    :row-class-name="rowClassName"
  >
    <el-table-column label="OrderID" min-width="168" show-overflow-tooltip>
      <template #default="{ row }">
        <div v-if="isGroupHead(row)" class="admin-order-group-bar">
          <slot name="group-head" :rows="row._groupRows" />
        </div>
        <span v-else class="admin-order-mono">{{ row.orderId || "—" }}</span>
      </template>
    </el-table-column>
    <el-table-column label="LinkID" width="156" show-overflow-tooltip>
      <template #default="{ row }">
        <span v-if="!isGroupHead(row)" class="admin-link-id-cell">
          {{ formatLinkId(row.linkId) }}
          <span
            v-for="src in [linkSourceTag(row.linkId)].filter(Boolean)"
            :key="src!.source"
            class="admin-link-source"
            :class="`admin-link-source--${src!.source}`"
            :title="src!.title"
          >{{ src!.label }}</span>
        </span>
      </template>
    </el-table-column>
    <el-table-column v-if="showUserColumn" label="用户" width="100" show-overflow-tooltip>
      <template #default="{ row }">
        <span v-if="!isGroupHead(row)">
          {{ userNameById?.get(row.userId) || row.userId.slice(0, 8) }}
        </span>
      </template>
    </el-table-column>
    <el-table-column label="平台" width="72" align="center">
      <template #default="{ row }">
        <span v-if="!isGroupHead(row)" class="admin-order-provider">{{ row.provider }}</span>
      </template>
    </el-table-column>
    <el-table-column label="比赛" min-width="160" show-overflow-tooltip>
      <template #default="{ row }">
        <span v-if="!isGroupHead(row)">{{ row.match }}</span>
      </template>
    </el-table-column>
    <el-table-column label="盘口" min-width="140" show-overflow-tooltip>
      <template #default="{ row }">
        <span v-if="!isGroupHead(row)">{{ row.bet }}</span>
      </template>
    </el-table-column>
    <el-table-column label="选项" width="100" show-overflow-tooltip>
      <template #default="{ row }">
        <span v-if="!isGroupHead(row)">{{ row.item }}</span>
      </template>
    </el-table-column>
    <el-table-column label="赔率" width="72" align="right">
      <template #default="{ row }">
        <span v-if="!isGroupHead(row)" class="admin-order-num">{{ row.odds }}</span>
      </template>
    </el-table-column>
    <el-table-column label="投注" width="88" align="right">
      <template #default="{ row }">
        <span v-if="!isGroupHead(row)" class="admin-order-num">{{ fmtMoney(row.betMoney) }}</span>
      </template>
    </el-table-column>
    <el-table-column label="盈利" width="88" align="right">
      <template #default="{ row }">
        <span
          v-if="!isGroupHead(row)"
          class="admin-order-num"
          :class="{ pos: row.money > 0, neg: row.money < 0 }"
        >{{ fmtMoney(row.money) }}</span>
      </template>
    </el-table-column>
    <el-table-column label="状态" width="88" align="center">
      <template #default="{ row }">
        <span
          v-if="!isGroupHead(row)"
          class="admin-badge"
          :class="statusBadgeClass(row.status)"
        >{{ row.status }}</span>
      </template>
    </el-table-column>
    <el-table-column label="时间" width="160" show-overflow-tooltip>
      <template #default="{ row }">
        <span v-if="!isGroupHead(row)" class="admin-order-time">{{ fmtTime(row.createAt) }}</span>
      </template>
    </el-table-column>
  </el-table>
</template>
