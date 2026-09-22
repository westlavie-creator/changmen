<script setup lang="ts">
import type { AdminUserConfigDetail, AdminUserRow } from "@/types/admin";
import { computed, onMounted, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import { getAdminUserConfigDetail } from "@/api/admin";
import { ADMIN_SETTING_LABELS, BET_SORTING_LABELS } from "@/components/admin/adminSettingLabels";
import UserWorkspacePreview from "@/components/admin/preview/UserWorkspacePreview.vue";

const props = defineProps<{
  user: AdminUserRow;
}>();

const emit = defineEmits<{ viewOrders: [] }>();

const configLoading = ref(false);
const configDetail = ref<AdminUserConfigDetail | null>(null);

const configGroups = computed(() => {
  const detail = configDetail.value;
  if (!detail)
    return [];
  return [
    { key: "USERCONFIG", title: "下注配置", data: detail.configs.USERCONFIG },
    { key: "CollectConfig", title: "采集配置", data: detail.configs.CollectConfig },
    { key: "preferences", title: "偏好配置", data: detail.configs.preferences },
    { key: "extraPreferences", title: "其他偏好", data: detail.configs.extraPreferences },
    { key: "ACCOUNT", title: "账号配置", data: detail.configs.ACCOUNT },
    { key: "raw", title: "原始分组", data: detail.raw },
  ];
});

const accountRows = computed(() => {
  const rows = configDetail.value?.configs.ACCOUNT;
  return Array.isArray(rows) ? rows : [];
});

const userConfig = computed(() => asRecord(configDetail.value?.configs.USERCONFIG));
const collectConfig = computed(() => asRecord(configDetail.value?.configs.CollectConfig));
const preferences = computed(() => asRecord(configDetail.value?.configs.preferences));
const extensions = computed(() => asRecord(preferences.value.Extensions));
const messageConfig = computed(() => asRecord(preferences.value.Message));
const followConfig = computed(() => asRecord(preferences.value.Follow));

const statusCards = computed(() => {
  const cfg = userConfig.value;
  const collect = collectRows.value;
  const activeCollect = collect.filter(row => row.enabled).length;
  const ext = extensions.value;
  return [
    {
      label: "自动买入",
      value: boolLabel(cfg.betting),
      tone: cfg.betting ? "on" : "off",
    },
    {
      label: "下注金额",
      value: moneyText(cfg.betMoney),
      tone: Number(cfg.betMoney) > 0 ? "normal" : "off",
    },
    {
      label: "采集平台",
      value: `${activeCollect}/${collect.length || 0}`,
      tone: activeCollect > 0 ? "on" : "off",
    },
    {
      label: "补单",
      value: boolLabel(cfg.makeUp),
      tone: cfg.makeUp ? "on" : "off",
    },
    {
      label: "正 EV 自动",
      value: boolLabel(asRecord(ext.valueBet).autoBet && asRecord(asRecord(ext.valueBet).autoBet).enabled),
      tone: asRecord(asRecord(ext.valueBet).autoBet).enabled ? "on" : "off",
    },
  ];
});

const bettingRows = computed(() => {
  const cfg = userConfig.value;
  return [
    fieldRow("betting", boolLabel(cfg.betting)),
    fieldRow("betMoney", moneyText(cfg.betMoney)),
    fieldRow("profit", percentLike(cfg.profit)),
    fieldRow("maxProfit", percentLike(cfg.maxProfit)),
    fieldRow("minOdds", valueText(cfg.minOdds)),
    fieldRow("maxOdds", valueText(cfg.maxOdds)),
    fieldRow("betCount", cfg.betCount ? `${cfg.betCount} 次` : "不限"),
    fieldRow("betSorting", BET_SORTING_LABELS[String(cfg.betSorting || "")] || valueText(cfg.betSorting)),
    fieldRow("BetTarget", boolLabel(cfg.BetTarget)),
  ];
});

const makeupRows = computed(() => {
  const cfg = userConfig.value;
  return [
    fieldRow("makeUp", boolLabel(cfg.makeUp)),
    fieldRow("makeUp_odds", valueText(cfg.makeUp_odds)),
    fieldRow("makeUp_defaultOdds", valueText(cfg.makeUp_defaultOdds)),
    fieldRow("makeProfit", percentLike(cfg.makeProfit)),
    fieldRow("anyOdds", boolLabel(cfg.anyOdds)),
    fieldRow("anyOddsProfit", percentLike(cfg.anyOddsProfit)),
    fieldRow("noSameProvider", boolLabel(cfg.noSameProvider)),
    fieldRow("noSameBet", boolLabel(cfg.noSameBet)),
  ];
});

const collectRows = computed(() => {
  const collect = collectConfig.value.collect;
  if (!Array.isArray(collect))
    return [];
  return collect
    .filter(row => Array.isArray(row) && row.length >= 2)
    .map(row => ({
      platform: String(row[0]),
      enabled: Boolean(row[1]),
    }))
    .sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.platform.localeCompare(b.platform));
});

const preferenceCards = computed(() => {
  const msg = messageConfig.value;
  const follow = followConfig.value;
  const ext = extensions.value;
  const valueBet = asRecord(ext.valueBet);
  const autoBet = asRecord(valueBet.autoBet);
  return [
    {
      title: "消息",
      rows: [
        { label: "Telegram", value: valueText(msg.telegramId) },
        { label: "投注消息", value: boolLabel(msg.bettingMessage) },
        { label: "进度报告", value: boolLabel(msg.arbProgressMessage) },
      ],
    },
    {
      title: "跟单",
      rows: [
        { label: "用户数", value: Array.isArray(follow.users) ? `${follow.users.length}` : "0" },
        { label: "配置", value: Object.keys(follow).length ? "已配置" : "未配置" },
      ],
    },
    {
      title: "扩展",
      rows: [
        { label: "界面增强", value: boolLabel(ext.betRowUi) },
        { label: "EV 标记", value: valueBet.minEdgePct != null ? `${valueBet.minEdgePct}%` : "—" },
        { label: "EV 自动下注", value: boolLabel(autoBet.enabled) },
      ],
    },
  ];
});

async function loadConfigDetail(force = false) {
  if (configLoading.value)
    return;
  if (configDetail.value && !force)
    return;
  configLoading.value = true;
  try {
    configDetail.value = await getAdminUserConfigDetail(props.user.id);
  }
  catch (err) {
    ElMessage.error(err instanceof Error ? err.message : "配置读取失败");
  }
  finally {
    configLoading.value = false;
  }
}

function formatJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function fieldRow(key: string, value: string) {
  return {
    key,
    label: ADMIN_SETTING_LABELS[key] || key,
    value,
  };
}

function valueText(value: unknown) {
  if (value && typeof value === "object" && "masked" in value)
    return String((value as { value?: unknown }).value ?? "***");
  if (typeof value === "boolean")
    return value ? "是" : "否";
  if (value == null || value === "")
    return "—";
  return String(value);
}

function boolLabel(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "true"
    ? "开启"
    : "关闭";
}

function moneyText(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0)
    return "—";
  return Math.round(n).toLocaleString();
}

function percentLike(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0)
    return "—";
  if (n > 0 && n < 10)
    return `${((n - 1) * 100).toFixed(2)}%`;
  return String(value);
}

watch(
  () => props.user.id,
  () => {
    configDetail.value = null;
    void loadConfigDetail(true);
  },
);

onMounted(() => {
  void loadConfigDetail();
});
</script>

<template>
  <div class="admin-user-detail-combo">
    <main class="admin-user-detail-combo__preview">
      <div class="admin-user-detail-combo__head">
        <h3>工作区预览</h3>
        <p>这里是用户实际工作区的只读状态。</p>
      </div>
      <UserWorkspacePreview :user="user" @view-orders="emit('viewOrders')" />
    </main>

    <aside class="admin-user-detail-combo__audit">
      <section v-loading="configLoading" class="admin-config-audit">
        <div class="admin-config-audit__toolbar">
          <div>
            <h3>配置解读</h3>
            <p>对应左侧预览，敏感字段已打码。</p>
          </div>
          <el-button size="small" @click="loadConfigDetail(true)">
            刷新
          </el-button>
        </div>

        <div v-if="configDetail" class="admin-config-audit__content">
          <div class="admin-config-audit__summary">
            <span
              v-for="card in statusCards"
              :key="card.label"
              :class="`admin-config-audit__summary-item admin-config-audit__summary-item--${card.tone}`"
            >
              <b>{{ card.value }}</b>
              <em>{{ card.label }}</em>
            </span>
            <span class="admin-config-audit__summary-item">
              <b>{{ accountRows.length }}</b>
              <em>账号</em>
            </span>
            <span class="admin-config-audit__summary-item">
              <b>{{ configDetail.user.role || 'user' }}</b>
              <em>角色</em>
            </span>
          </div>

          <el-alert
            v-if="Object.keys(configDetail.parseErrors).length"
            type="warning"
            show-icon
            :closable="false"
            title="部分 preferences 不是 JSON，已按原始字符串展示"
          />

          <div class="admin-config-audit__overview">
            <article class="admin-config-card">
              <h4>下注核心</h4>
              <dl>
                <template v-for="row in bettingRows" :key="row.key">
                  <dt>{{ row.label }}</dt>
                  <dd>{{ row.value }}</dd>
                </template>
              </dl>
            </article>

            <article class="admin-config-card">
              <h4>补单与风控</h4>
              <dl>
                <template v-for="row in makeupRows" :key="row.key">
                  <dt>{{ row.label }}</dt>
                  <dd>{{ row.value }}</dd>
                </template>
              </dl>
            </article>

            <article class="admin-config-card admin-config-card--collect">
              <h4>采集开关</h4>
              <div v-if="collectRows.length" class="admin-config-chips">
                <span
                  v-for="row in collectRows"
                  :key="row.platform"
                  :class="['admin-config-chip', row.enabled ? 'admin-config-chip--on' : '']"
                >
                  {{ row.platform }}
                </span>
              </div>
              <el-empty v-else description="未保存采集配置" :image-size="48" />
            </article>

            <article
              v-for="card in preferenceCards"
              :key="card.title"
              class="admin-config-card"
            >
              <h4>{{ card.title }}</h4>
              <dl>
                <template v-for="row in card.rows" :key="row.label">
                  <dt>{{ row.label }}</dt>
                  <dd>{{ row.value }}</dd>
                </template>
              </dl>
            </article>
          </div>

          <section class="admin-config-section">
            <h4>账号配置</h4>
            <el-table
              v-if="accountRows.length"
              :data="accountRows"
              size="small"
              class="admin-config-audit__accounts"
            >
              <el-table-column prop="accountId" label="ID" width="80" />
              <el-table-column prop="platform" label="平台" width="120" />
              <el-table-column prop="playerName" label="账号名" min-width="140" />
              <el-table-column label="余额" width="110">
                <template #default="{ row }">
                  {{ valueText(row.balance) }}
                </template>
              </el-table-column>
              <el-table-column label="利润" width="100">
                <template #default="{ row }">
                  {{ percentLike(row.profit) }}
                </template>
              </el-table-column>
              <el-table-column label="凭证" width="90">
                <template #default="{ row }">
                  {{ row.hasCredentials ? '有' : '无' }}
                </template>
              </el-table-column>
              <el-table-column label="暂停" width="90">
                <template #default="{ row }">
                  {{ valueText(row.pause) }}
                </template>
              </el-table-column>
            </el-table>
            <el-empty v-else description="暂无账号" :image-size="56" />
          </section>

          <el-collapse class="admin-config-raw">
            <el-collapse-item title="原始配置 JSON" name="raw">
              <div class="admin-config-audit__grid">
                <article
                  v-for="group in configGroups"
                  :key="group.key"
                  class="admin-config-audit__panel"
                >
                  <h4>{{ group.title }}</h4>
                  <pre>{{ formatJson(group.data) }}</pre>
                </article>
              </div>
            </el-collapse-item>
          </el-collapse>
        </div>

        <el-empty v-else-if="!configLoading" description="暂无配置快照" />
      </section>
    </aside>
  </div>
</template>

<style scoped>
.admin-user-detail-combo {
  display: grid;
  grid-template-columns: minmax(560px, 1fr) minmax(360px, 420px);
  gap: 14px;
  align-items: start;
  min-height: 520px;
}

.admin-user-detail-combo__preview,
.admin-user-detail-combo__audit {
  min-width: 0;
}

.admin-user-detail-combo__preview {
  border-right: 1px solid rgba(148, 163, 184, 0.12);
  padding-right: 14px;
}

.admin-user-detail-combo__audit {
  position: sticky;
  top: 0;
  max-height: calc(100vh - 140px);
  overflow: auto;
  padding-right: 2px;
}

.admin-user-detail-combo__head {
  margin-bottom: 8px;
}

.admin-user-detail-combo__head h3 {
  margin: 0;
  font-size: 15px;
  color: var(--adm-text, #e2e8f0);
}

.admin-user-detail-combo__head p {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--adm-text-muted, #94a3b8);
}

.admin-config-audit {
  min-height: 420px;
  padding: 0 0 16px;
}

.admin-config-audit__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

.admin-config-audit__toolbar h3 {
  margin: 0;
  font-size: 15px;
  color: var(--adm-text, #e2e8f0);
}

.admin-config-audit__toolbar p {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--adm-text-muted, #94a3b8);
}

.admin-config-audit__summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}

.admin-config-audit__summary-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 56px;
  padding: 9px 10px;
  border: 1px solid var(--adm-border, #334155);
  border-radius: 6px;
  color: var(--adm-text, #e2e8f0);
  background: rgba(15, 23, 42, 0.28);
}

.admin-config-audit__summary-item b {
  font-size: 17px;
  font-weight: 650;
}

.admin-config-audit__summary-item em {
  font-style: normal;
  font-size: 12px;
  color: var(--adm-text-muted, #94a3b8);
}

.admin-config-audit__summary-item--on b {
  color: #86efac;
}

.admin-config-audit__summary-item--off b {
  color: #fca5a5;
}

.admin-config-audit__accounts {
  margin-bottom: 12px;
}

.admin-config-audit__overview {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  margin-top: 12px;
}

.admin-config-card,
.admin-config-section {
  border: 1px solid var(--adm-border, #334155);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.2);
}

.admin-config-card h4,
.admin-config-section h4 {
  margin: 0;
  padding: 9px 10px;
  border-bottom: 1px solid var(--adm-border, #334155);
  font-size: 13px;
  color: var(--adm-text, #e2e8f0);
}

.admin-config-card dl {
  display: grid;
  grid-template-columns: minmax(92px, 1fr) minmax(84px, auto);
  gap: 0;
  margin: 0;
  padding: 6px 10px 8px;
}

.admin-config-card dt,
.admin-config-card dd {
  min-height: 28px;
  margin: 0;
  padding: 5px 0;
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
  font-size: 12px;
}

.admin-config-card dt {
  color: var(--adm-text-muted, #94a3b8);
}

.admin-config-card dd {
  text-align: right;
  color: var(--adm-text, #e2e8f0);
}

.admin-config-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 10px;
}

.admin-config-chip {
  min-width: 44px;
  padding: 4px 7px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 6px;
  text-align: center;
  font-size: 12px;
  color: var(--adm-text-muted, #94a3b8);
  background: rgba(15, 23, 42, 0.22);
}

.admin-config-chip--on {
  border-color: rgba(34, 197, 94, 0.44);
  color: #bbf7d0;
  background: rgba(22, 101, 52, 0.24);
}

.admin-config-section {
  margin-top: 12px;
  padding-bottom: 4px;
}

.admin-config-section :deep(.el-table) {
  border-radius: 0 0 8px 8px;
}

.admin-config-raw {
  margin-top: 12px;
}

.admin-config-audit__grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  margin-top: 12px;
}

.admin-config-audit__panel {
  border: 1px solid var(--adm-border, #334155);
  border-radius: 8px;
  overflow: hidden;
  background: rgba(15, 23, 42, 0.2);
}

.admin-config-audit__panel h4 {
  margin: 0;
  padding: 8px 10px;
  border-bottom: 1px solid var(--adm-border, #334155);
  font-size: 13px;
  color: var(--adm-text, #e2e8f0);
}

.admin-config-audit__panel pre {
  max-height: 360px;
  margin: 0;
  padding: 10px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: Consolas, "Courier New", monospace;
  font-size: 12px;
  line-height: 1.5;
  color: var(--adm-text, #e2e8f0);
}

@media (max-width: 1180px) {
  .admin-user-detail-combo {
    grid-template-columns: 1fr;
  }

  .admin-user-detail-combo__preview {
    border-right: 0;
    padding-right: 0;
  }

  .admin-user-detail-combo__audit {
    position: static;
    max-height: none;
  }

  .admin-config-audit__summary {
    grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  }
}
</style>
