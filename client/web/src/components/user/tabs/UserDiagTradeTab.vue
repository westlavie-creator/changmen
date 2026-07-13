<script setup lang="ts">
import type { TradeRemoteAccount } from "@/realtime/userChannel";
import type { PlatformId, UserListRow } from "@/types/esport";
import { ElMessage } from "element-plus";
import { computed, onMounted, ref, watch } from "vue";
import { getUsers } from "@/api/chat";
import {
  ensureTradeReplyChannel,
  patchRemoteAccount,
  queryRemoteAccounts,

} from "@/realtime/userChannel";
import { useUserStore } from "@/stores/userStore";
import { ALL_PLATFORMS } from "@/types/userConfig";

const TRADE_USERS_KEY = "TRADE:USERS";

/** [A8 可证实] TradeView `d`：bundle 原文拼写 Faild */
type TradeFetchStatus = "Loading" | "Success" | "Faild";

const userStore = useUserStore();
const provider = ref<PlatformId>("PB");
const allUsers = ref<UserListRow[]>([]);
const selectedUserIds = ref<number[]>(
  JSON.parse(sessionStorage.getItem(TRADE_USERS_KEY) ?? "[]") as number[],
);
/** remoteUserId -> accounts */
const accountsByUser = ref(new Map<number, TradeRemoteAccount[]>());
/** accountId -> remoteUserId */
const accountOwner = new Map<number, number>();
/** remoteUserId -> GoEasy query 拉取状态 */
const fetchStatus = ref(new Map<number, TradeFetchStatus>());

const onlineUsers = computed(() =>
  allUsers.value
    .filter(u => Number(u.isOnline) === 1)
    .slice()
    .sort((a, b) =>
      String(a.userName ?? a.UserName ?? "").localeCompare(
        String(b.userName ?? b.UserName ?? ""),
        "zh-CN",
      ),
    ),
);

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
  return allUsers.value.find(u => tradeUserId(u) === uid)?.userName;
}

function tradeUserId(u: UserListRow): number {
  return Number(u.userId ?? u.UserID ?? u.Id ?? 0);
}

function userFetchStatus(userId: number): TradeFetchStatus | undefined {
  return fetchStatus.value.get(userId);
}

function setUserFetchStatus(userId: number, status: TradeFetchStatus) {
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
  }
  catch (e) {
    ElMessage.error(e instanceof Error ? e.message : "加载用户列表失败");
  }
}

async function fetchAccountsForUser(remoteUserId: number) {
  const adminId = userStore.userId;
  if (!adminId || !remoteUserId)
    return;
  setUserFetchStatus(remoteUserId, "Loading");
  const list = await queryRemoteAccounts(adminId, remoteUserId, provider.value);
  if (list === null) {
    setUserFetchStatus(remoteUserId, "Faild");
    return;
  }
  if (!accountsByUser.value.has(remoteUserId)) {
    accountsByUser.value.set(remoteUserId, []);
  }
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
  setUserFetchStatus(remoteUserId, "Success");
}

async function reloadSelectedUsers() {
  if (!selectedUserIds.value.length)
    return;
  sessionStorage.setItem(TRADE_USERS_KEY, JSON.stringify(selectedUserIds.value));
  clearFetchStatus();
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

onMounted(async () => {
  if (!userStore.userId)
    return;
  try {
    await ensureTradeReplyChannel(userStore.userId);
    await loadUsers();
    await reloadSelectedUsers();
  }
  catch (e) {
    ElMessage.warning(
      e instanceof Error ? e.message : "realtime hub 未连接，远程操盘不可用",
    );
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
  <el-form class="user-diag-trade">
    <el-form-item label="平台：">
      <el-radio-group v-model="provider">
        <el-radio v-for="p in ALL_PLATFORMS" :key="p" :value="p">
          {{ p }}
        </el-radio>
      </el-radio-group>
    </el-form-item>

    <el-form-item>
      <template #label>
        用户列表：
      </template>
      <el-checkbox-group v-model="selectedUserIds">
        <el-checkbox v-for="u in onlineUsers" :key="tradeUserId(u)" :value="tradeUserId(u)">
          <div
            class="username"
            :class="userFetchStatus(tradeUserId(u))"
          >
            {{ u.userName ?? u.UserName }}
          </div>
        </el-checkbox>
      </el-checkbox-group>
    </el-form-item>

    <el-row :gutter="10">
      <el-col v-for="acc in displayAccounts" :key="acc.accountId" :span="12">
        <fieldset>
          <legend>
            <template v-if="ownerName(acc.accountId)">
              [{{ ownerName(acc.accountId) }}]
            </template>
            {{ acc.platformName }}/{{ acc.playerName }}
            <template v-if="acc.balance != null">
              / {{ acc.balance.toFixed(0) }}
            </template>
            <el-button link type="primary" class="am-icon-refresh" @click="fetchAccountsForUser(accountOwner.get(acc.accountId)!)" />
          </legend>
          <el-row :gutter="10">
            <el-col :span="8">
              <el-switch
                v-model="acc.pause"
                active-text="暂停"
                inactive-text="开启"
                inline-prompt
                @change="onFieldChange(acc, 'pause')"
              />
            </el-col>
            <el-col :span="8">
              <el-switch
                v-model="acc.lastOdds"
                active-text="上次投注"
                inactive-text="上次投注"
                inline-prompt
                @change="onFieldChange(acc, 'lastOdds')"
              />
            </el-col>
            <el-col v-for="field in tradeFields" :key="field" :span="8">
              <el-input
                v-model.number="acc[field]"
                @change="onFieldChange(acc, field)"
              >
                <template #prepend>
                  <div class="account-field" :title="field">
                    {{ field }}
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
