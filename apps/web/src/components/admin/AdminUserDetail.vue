<script setup lang="ts">
import { computed } from "vue";
import type { AdminAccountDetail, AdminUserRow } from "@/types/admin";
import {
  ADMIN_SETTING_LABELS,
  BET_SORTING_LABELS,
} from "@/components/admin/adminSettingLabels";

const props = defineProps<{
  user: AdminUserRow;
}>();

const emit = defineEmits<{ viewOrders: [] }>();

function fmtTime(ts: number) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

function fmtMoney(n: number) {
  return Math.floor(n).toLocaleString();
}

function fmtBool(v: unknown) {
  return v === true || v === 1 ? "是" : "否";
}

function fmtSettingValue(key: string, value: unknown): string {
  if (value == null || value === "") return "—";
  if (key === "bettingAutoOpenTime" && typeof value === "number" && value > 0) {
    return fmtTime(value);
  }
  if (key === "betSorting" && typeof value === "string") {
    return BET_SORTING_LABELS[value] ?? value;
  }
  if (Array.isArray(value)) {
    if (!value.length) return "—";
    return value.map(String).join(", ");
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (!entries.length) return "—";
    return entries.map(([k, v]) => `${k}: ${v}`).join("; ");
  }
  if (typeof value === "boolean") return fmtBool(value);
  return String(value);
}

const settingRows = computed(() => {
  const s = props.user.setting || {};
  const keys = Object.keys(s).sort((a, b) => {
    const ak = ADMIN_SETTING_LABELS[a] ? 0 : 1;
    const bk = ADMIN_SETTING_LABELS[b] ? 0 : 1;
    if (ak !== bk) return ak - bk;
    return a.localeCompare(b);
  });
  return keys.map((key) => ({
    key,
    label: ADMIN_SETTING_LABELS[key] ?? key,
    value: fmtSettingValue(key, s[key]),
  }));
});

const gameRows = computed(() => {
  const rows: { accountId: number; platform: string; game: string; betCount: number; profit: number; odds: string }[] = [];
  for (const acc of props.user.accounts) {
    for (const [game, cfg] of Object.entries(acc.game || {})) {
      rows.push({
        accountId: acc.accountId,
        platform: acc.platform,
        game,
        betCount: cfg.betCount,
        profit: cfg.profit,
        odds: (cfg.odds || []).join(", ") || "—",
      });
    }
  }
  return rows;
});

function accountFlags(row: AdminAccountDetail) {
  const flags: string[] = [];
  if (row.pause) flags.push("暂停");
  if (row.markupOnly) flags.push("仅补单");
  if (row.noMarkup) flags.push("不补单");
  if (row.active) flags.push("投注中");
  if (row.hasCredentials) flags.push("已登录");
  return flags.length ? flags.join(" / ") : "—";
}
</script>

<template>
  <div class="admin-user-detail">
    <div class="admin-user-detail__row">
      <section class="admin-user-detail__col admin-user-detail__col--profile">
        <div class="admin-user-detail__title">{{ user.userName }}</div>
        <div class="admin-user-detail__meta">
          <div>注册 {{ fmtTime(user.createdAt) }}</div>
          <div>更新 {{ fmtTime(user.updatedAt) }}</div>
          <div>账号 {{ user.accountCount }}</div>
        </div>
        <div class="admin-user-detail__stats">
          <div>
            当日盈利
            <strong :class="{ pos: user.todayMoney > 0, neg: user.todayMoney < 0 }">
              {{ fmtMoney(user.todayMoney) }}
            </strong>
          </div>
          <div>订单 <strong>{{ user.todayCount }}</strong></div>
          <div>流水 <strong>{{ fmtMoney(user.todayBetMoney) }}</strong></div>
        </div>
        <el-button size="small" type="primary" plain @click="emit('viewOrders')">当日订单</el-button>
      </section>

      <section class="admin-user-detail__col admin-user-detail__col--setting">
        <h3 class="admin-user-detail__section-title">投注参数</h3>
        <div v-if="settingRows.length" class="admin-user-detail__setting-grid">
          <div v-for="row in settingRows" :key="row.key" class="admin-user-detail__kv">
            <span class="admin-user-detail__kv-label">{{ row.label }}</span>
            <span class="admin-user-detail__kv-value" :title="row.value">{{ row.value }}</span>
          </div>
        </div>
        <div v-else class="admin-user-detail__empty">暂无配置</div>
      </section>

      <section class="admin-user-detail__col admin-user-detail__col--accounts">
        <h3 class="admin-user-detail__section-title">下注账号 ({{ user.accounts.length }})</h3>
        <div class="admin-user-detail__table-wrap">
          <el-table :data="user.accounts" size="small" stripe>
            <el-table-column prop="platform" label="平台" width="64" fixed />
            <el-table-column prop="accountId" label="ID" width="52" />
            <el-table-column prop="playerName" label="昵称" width="88" show-overflow-tooltip />
            <el-table-column prop="platformName" label="场馆" width="80" show-overflow-tooltip />
            <el-table-column label="余额" width="76">
              <template #default="{ row }">{{ fmtMoney(row.balance) }}</template>
            </el-table-column>
            <el-table-column label="信用" width="72">
              <template #default="{ row }">{{ fmtMoney(row.credit) }}</template>
            </el-table-column>
            <el-table-column prop="currency" label="币" width="44" />
            <el-table-column label="当日" width="72">
              <template #default="{ row }">
                <span :class="{ pos: row.today > 0, neg: row.today < 0 }">{{ fmtMoney(row.today) }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="unsettle" label="未结" width="48" />
            <el-table-column label="赔率" width="88">
              <template #default="{ row }">{{ row.minOdds }}~{{ row.maxOdds }}</template>
            </el-table-column>
            <el-table-column label="利润" width="88">
              <template #default="{ row }">{{ row.profit }}~{{ row.maxProfit }}</template>
            </el-table-column>
            <el-table-column prop="maxBetCount" label="限次" width="48" />
            <el-table-column prop="maxOrder" label="限单" width="48" />
            <el-table-column prop="multiply" label="倍" width="40" />
            <el-table-column label="网关" width="100" show-overflow-tooltip>
              <template #default="{ row }">{{ row.gatewayHost || "—" }}</template>
            </el-table-column>
            <el-table-column label="状态" width="100" show-overflow-tooltip>
              <template #default="{ row }">{{ accountFlags(row) }}</template>
            </el-table-column>
            <el-table-column prop="description" label="备注" min-width="80" show-overflow-tooltip />
          </el-table>
        </div>
      </section>

      <section v-if="gameRows.length" class="admin-user-detail__col admin-user-detail__col--games">
        <h3 class="admin-user-detail__section-title">游戏限制</h3>
        <div class="admin-user-detail__table-wrap">
          <el-table :data="gameRows" size="small" stripe>
            <el-table-column prop="platform" label="平台" width="56" />
            <el-table-column prop="accountId" label="账号" width="52" />
            <el-table-column prop="game" label="游戏" width="72" show-overflow-tooltip />
            <el-table-column prop="betCount" label="次数" width="52" />
            <el-table-column prop="profit" label="利润" width="56" />
            <el-table-column prop="odds" label="赔率" min-width="100" show-overflow-tooltip />
          </el-table>
        </div>
      </section>
    </div>
  </div>
</template>
