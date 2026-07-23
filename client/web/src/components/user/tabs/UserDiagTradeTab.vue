<script setup lang="ts">
import type { TradeRemoteAccount } from "@/realtime/userChannel";
import type { PlatformId, UserListRow } from "@/types/esport";
import { ElMessage } from "element-plus";
import { computed, onMounted, ref, watch } from "vue";
import { getAdminUserTradeAccounts } from "@/api/admin";
import { getUsers } from "@/api/chat";
import {
  ensureTradeReplyChannel,
  patchRemoteAccount,
  queryRemoteAccounts,

} from "@/realtime/userChannel";
import { useUserStore } from "@/stores/userStore";
import { mergeProviderSortValue } from "@/types/userConfig";

const TRADE_USERS_KEY = "TRADE:USERS";

/** [A8 可证实] TradeView `d`：bundle 原文拼写 Faild */
type TradeFetchStatus = "Loading" | "Success" | "Faild";

const userStore = useUserStore();
const hubError = ref<string | null>(null);
const provider = ref<PlatformId>("PB");
const tradePlatforms = computed(() =>
  mergeProviderSortValue(userStore.config.providerSortValue ?? []),
);
const allUsers = ref<UserListRow[]>([]);
const selectedUserIds = ref<string[]>(loadSelectedUserIds());
/** remoteUserId -> accounts */
const accountsByUser = ref(new Map<string, TradeRemoteAccount[]>());
/** accountId -> remoteUserId */
const accountOwner = new Map<number, string>();
/** remoteUserId -> pub/sub query 拉取状态 */
const fetchStatus = ref(new Map<string, TradeFetchStatus>());
/** 远程 query 失败、改读 RDS 快照的用户 */
const snapshotUserIds = ref(new Set<string>());

function loadSelectedUserIds(): string[] {
  try {
    const raw = JSON.parse(sessionStorage.getItem(TRADE_USERS_KEY) ?? "[]") as unknown;
    if (!Array.isArray(raw))
      return [];
    return raw.map(v => String(v)).filter(Boolean);
  }
  catch {
    return [];
  }
}

/** Client_GetUsers 返回 UUID 字符串；禁止 Number() 否则全部为 NaN */
function tradeUserId(u: UserListRow): string {
  const raw = u.userId ?? u.UserID ?? u.Id;
  if (raw === undefined || raw === null)
    return "";
  const id = String(raw).trim();
  return id && id !== "0" ? id : "";
}

const onlineUsers = computed(() => {
  const seen = new Set<string>();
  const rows: UserListRow[] = [];
  for (const u of allUsers.value) {
    if (Number(u.isOnline) !== 1)
      continue;
    const id = tradeUserId(u);
    if (!id || seen.has(id))
      continue;
    seen.add(id);
    rows.push(u);
  }
  return rows.sort((a, b) =>
    String(a.userName ?? a.UserName ?? "").localeCompare(
      String(b.userName ?? b.UserName ?? ""),
      "zh-CN",
    ),
  );
});

const displayAccounts = computed(() => {
  const rows: TradeRemoteAccount[] = [];
  for (const uid of selectedUserIds.value) {
    const list = accountsByUser.value.get(uid) ?? [];
    rows.push(...list.filter(a => a.provider === provider.value));
  }
  return rows;
});

function ownerName(accountId: number): string | undefined {
  const uid = accountOwner.get(accountId);
  if (!uid)
    return undefined;
  return allUsers.value.find(u => tradeUserId(u) === uid)?.userName
    ?? allUsers.value.find(u => tradeUserId(u) === uid)?.UserName;
}

function userLabel(u: UserListRow): string {
  return String(u.userName ?? u.UserName ?? tradeUserId(u) ?? "—");
}

function userFetchStatus(userId: string): TradeFetchStatus | undefined {
  return fetchStatus.value.get(userId);
}

function setUserFetchStatus(userId: string, status: TradeFetchStatus) {
  const next = new Map(fetchStatus.value);
  next.set(userId, status);
  fetchStatus.value = next;
}

function clearFetchStatus() {
  fetchStatus.value = new Map();
}

async function loadUsers() {
  try {
    allUsers.value = (await getUsers()) ?? [];
    const onlineIds = new Set(
      allUsers.value
        .filter(u => Number(u.isOnline) === 1)
        .map(u => tradeUserId(u))
        .filter(Boolean),
    );
    selectedUserIds.value = selectedUserIds.value.filter(id => onlineIds.has(id));
  }
  catch (e) {
    ElMessage.error(e instanceof Error ? e.message : "加载用户列表失败");
  }
}

async function fetchAccountsForUser(remoteUserId: string) {
  const adminId = userStore.userId;
  if (!adminId || !remoteUserId)
    return;
  setUserFetchStatus(remoteUserId, "Loading");
  markSnapshotUser(remoteUserId, false);
  let list = await queryRemoteAccounts(adminId, remoteUserId, provider.value);
  if (list === null && userStore.isAdmin) {
    try {
      const snapshot = await getAdminUserTradeAccounts(remoteUserId, provider.value);
      if (snapshot.length) {
        list = snapshot;
        markSnapshotUser(remoteUserId, true);
      }
    }
    catch {
      /* 快照失败仍走 Faild */
    }
  }
  if (list === null) {
    setUserFetchStatus(remoteUserId, "Faild");
    return;
  }
  applyAccountRows(remoteUserId, list);
  setUserFetchStatus(remoteUserId, "Success");
}

async function reloadSelectedUsers() {
  if (!selectedUserIds.value.length)
    return;
  sessionStorage.setItem(TRADE_USERS_KEY, JSON.stringify(selectedUserIds.value));
  clearFetchStatus();
  snapshotUserIds.value = new Set();
  for (const id of selectedUserIds.value)
    await fetchAccountsForUser(id);
}

async function onFieldChange(acc: TradeRemoteAccount, field: string) {
  const remoteUserId = accountOwner.get(acc.accountId);
  if (!remoteUserId)
    return;
  await patchRemoteAccount(remoteUserId, acc.accountId, field, acc);
}

const tradeFields = ["profit", "maxBetCount", "minOdds", "maxOdds", "multiply"] as const;

/** prepend 中文标签；title 仍保留英文字段名供 hover / patch 对照 A8 */
const tradeFieldLabels: Record<(typeof tradeFields)[number], string> = {
  profit: "利润",
  maxBetCount: "单数",
  minOdds: "最低",
  maxOdds: "最高",
  multiply: "倍数",
};

const accountColSpan = computed(() =>
  displayAccounts.value.length === 1 ? 24 : 12,
);

const tradeStatusHint = computed(() => {
  if (!selectedUserIds.value.length || displayAccounts.value.length)
    return null;
  const failed = selectedUserIds.value.filter(id => fetchStatus.value.get(id) === "Faild");
  if (failed.length)
    return "无法连接对方客户端（用户名红色）；请确认 River 已登录并保持页面打开。管理员可刷新重试。";
  return `已选用户在 ${provider.value} 平台暂无账号`;
});

const snapshotHint = computed(() => {
  if (!selectedUserIds.value.some(id => snapshotUserIds.value.has(id)))
    return null;
  return "当前为服务端账号快照；实时修改（暂停/参数）需对方客户端在线并已连接 realtime。";
});

function markSnapshotUser(remoteUserId: string, fromSnapshot: boolean) {
  const next = new Set(snapshotUserIds.value);
  if (fromSnapshot)
    next.add(remoteUserId);
  else next.delete(remoteUserId);
  snapshotUserIds.value = next;
}

function applyAccountRows(remoteUserId: string, list: TradeRemoteAccount[]) {
  if (!accountsByUser.value.has(remoteUserId))
    accountsByUser.value.set(remoteUserId, []);
  const bucket = accountsByUser.value.get(remoteUserId)!;
  for (const row of list) {
    if (!row.accountId)
      continue;
    accountOwner.set(row.accountId, remoteUserId);
    const idx = bucket.findIndex(x => x.accountId === row.accountId);
    if (idx === -1)
      bucket.push(row);
    else bucket[idx] = row;
  }
  accountsByUser.value = new Map(accountsByUser.value);
}

onMounted(async () => {
  if (!userStore.userId)
    return;
  hubError.value = null;
  try {
    await ensureTradeReplyChannel(userStore.userId);
    await loadUsers();
    await reloadSelectedUsers();
  }
  catch (e) {
    hubError.value = e instanceof Error ? e.message : "realtime hub 未连接，远程操盘不可用";
    ElMessage.warning(hubError.value);
  }
});

watch(provider, () => {
  void reloadSelectedUsers();
});

watch(selectedUserIds, () => {
  void reloadSelectedUsers();
}, { deep: true });
</script>

<template>
  <el-form class="user-diag-trade" label-width="80px">
    <el-alert
      v-if="hubError"
      class="trade-hub-banner"
      type="warning"
      :closable="false"
      show-icon
      :title="hubError"
    />

    <el-form-item label="平台：">
      <el-radio-group v-model="provider">
        <el-radio v-for="p in tradePlatforms" :key="p" :value="p">
          {{ p }}
        </el-radio>
      </el-radio-group>
    </el-form-item>

    <el-form-item>
      <template #label>
        用户列表：
      </template>
      <div class="trade-user-list">
        <el-checkbox-group v-model="selectedUserIds">
          <el-checkbox
            v-for="u in onlineUsers"
            :key="tradeUserId(u)"
            :value="tradeUserId(u)"
          >
            <span
              class="username"
              :class="userFetchStatus(tradeUserId(u))"
            >
              {{ userLabel(u) }}
            </span>
          </el-checkbox>
        </el-checkbox-group>
      </div>
    </el-form-item>

    <p
      v-if="tradeStatusHint"
      class="trade-hint trade-hint--accounts"
    >
      {{ tradeStatusHint }}
    </p>
    <p
      v-if="snapshotHint"
      class="trade-hint trade-hint--snapshot"
    >
      {{ snapshotHint }}
    </p>

    <el-row :gutter="10" class="trade-accounts-row">
      <el-col
        v-for="acc in displayAccounts"
        :key="acc.accountId"
        :span="accountColSpan"
        class="trade-account-col"
      >
        <fieldset class="trade-account-fieldset">
          <legend class="trade-account-legend">
            <span class="trade-account-legend__text">
              <template v-if="ownerName(acc.accountId)">
                [{{ ownerName(acc.accountId) }}]
              </template>
              {{ acc.platformName }}/{{ acc.playerName }}
              <template v-if="acc.balance != null">
                / {{ acc.balance.toFixed(0) }}
              </template>
            </span>
            <el-button
              link
              type="primary"
              class="trade-account-refresh"
              @click="fetchAccountsForUser(accountOwner.get(acc.accountId)!)"
            >
              <i class="am-icon-refresh" />
            </el-button>
          </legend>
          <el-row :gutter="10" class="trade-account-controls">
            <el-col :span="12" class="trade-switch-col">
              <el-switch
                v-model="acc.pause"
                size="large"
                active-text="暂停"
                inactive-text="开启"
                inline-prompt
                style="height: 24px"
                @change="onFieldChange(acc, 'pause')"
              />
            </el-col>
            <el-col :span="12" class="trade-switch-col">
              <el-switch
                v-model="acc.lastOdds"
                size="large"
                active-text="上次买入"
                inactive-text="上次买入"
                inline-prompt
                style="height: 24px"
                @change="onFieldChange(acc, 'lastOdds')"
              />
            </el-col>
            <el-col v-for="field in tradeFields" :key="field" :span="8" class="trade-field-col">
              <el-input
                v-model.number="acc[field]"
                type="number"
                @change="onFieldChange(acc, field)"
              >
                <template #prepend>
                  <div class="account-field" :title="field">
                    {{ tradeFieldLabels[field] }}
                  </div>
                </template>
              </el-input>
            </el-col>
          </el-row>
        </fieldset>
      </el-col>
    </el-row>
  </el-form>
</template>
