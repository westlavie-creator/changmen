import type { PlatformAccount } from "@/models/platformAccount";
import type { PlatformId } from "@/types/esport";
import { resolveAccountMultiply } from "@changmen/shared/account_multiply";
import {
  ensureGoEasyConnected,
  goeasyPublish,
  goeasyRequestReply,
  goeasySetReply,
  goeasySubscribe,
  goeasyUnsubscribe,
  newMsgId,
} from "@/realtime/goeasyClient";
import { useAccountStore } from "@/stores/accountStore";
import { useConfigStore } from "@/stores/configStore";

let subscribedUserId: number | null = null;

/** 远程操盘展示的账号快照（对齐 A8 query accounts 返回） */
export interface TradeRemoteAccount {
  accountId: number;
  platformName?: string;
  platformId?: number;
  playerName?: string;
  provider?: string;
  balance?: number;
  pause?: boolean;
  lastOdds?: boolean;
  profit?: number;
  maxBetCount?: number;
  minOdds?: number;
  maxOdds?: number;
  multiply?: number;
}

function userChannel(userId: number) {
  return `USER:${userId}`;
}

function tradeChannel(adminUserId: number) {
  return `TRADE:${adminUserId}`;
}

/** 对齐 A8 `ep.UserChannel`：本机用户接收远程操盘指令 */
async function handleUserChannelMessage(raw: string) {
  const envelope = JSON.parse(raw) as {
    action?: string;
    info?: Record<string, unknown>;
  };
  const accountStore = useAccountStore();
  const configStore = useConfigStore();

  switch (envelope.action) {
    case "account": {
      const info = envelope.info ?? {};
      const acc = accountStore.findAccount(Number(info.accountId));
      if (!acc)
        return;
      if (info.pause !== undefined)
        acc.pause = Boolean(info.pause);
      if (info.profit !== undefined)
        acc.profit = Number(info.profit);
      if (info.maxBetCount !== undefined)
        acc.maxBetCount = Number(info.maxBetCount);
      if (info.minOdds !== undefined)
        acc.minOdds = Number(info.minOdds);
      if (info.maxOdds !== undefined)
        acc.maxOdds = Number(info.maxOdds);
      if (info.lastOdds !== undefined)
        acc.lastOdds = Boolean(info.lastOdds);
      if (info.multiply !== undefined) {
        acc.multiply = resolveAccountMultiply(acc.provider, info.multiply);
      }
      break;
    }
    case "upload": {
      const type = (envelope.info as { type?: string })?.type;
      if (type === "account")
        await accountStore.saveAccounts();
      if (type === "config")
        await configStore.save();
      break;
    }
    case "query": {
      const info = envelope.info as {
        type?: string;
        msgId?: string;
        reply?: string;
        data?: { accountId?: number; provider?: string };
      };
      let content: unknown;
      switch (info.type) {
        case "account": {
          const row = accountStore.findAccount(Number(info.data?.accountId));
          content = row ? serializeTradeAccount(row) : null;
          break;
        }
        case "accounts": {
          const provider = info.data?.provider as PlatformId | undefined;
          content = accountStore.accounts
            .filter(a => !provider || a.provider === provider)
            .map(serializeTradeAccount);
          break;
        }
        default:
          return;
      }
      if (!info.reply || !info.msgId)
        return;
      await goeasyPublish(
        info.reply,
        JSON.stringify({ msgId: info.msgId, content }),
      );
      break;
    }
    default:
      break;
  }
}

function serializeTradeAccount(d: PlatformAccount): TradeRemoteAccount {
  return {
    accountId: d.accountId,
    platformName: d.platformName,
    platformId: d.platformId,
    playerName: d.playerName,
    provider: d.provider,
    balance: d.balance,
    pause: d.pause,
    lastOdds: d.lastOdds,
    profit: d.profit,
    maxBetCount: d.maxBetCount,
    minOdds: d.minOdds,
    maxOdds: d.maxOdds,
    multiply: d.multiply,
  };
}

/** 对齐 A8 `$8e`：登录后订阅 USER 通道 */
export async function subscribeUserChannel(userId: number) {
  if (!userId || subscribedUserId === userId)
    return;
  if (subscribedUserId)
    goeasyUnsubscribe(userChannel(subscribedUserId));
  subscribedUserId = userId;
  await goeasySubscribe(userChannel(userId), (content) => {
    void handleUserChannelMessage(content);
  });
}

export function unsubscribeUserChannel() {
  if (subscribedUserId) {
    goeasyUnsubscribe(userChannel(subscribedUserId));
    subscribedUserId = null;
  }
}

let tradeReplyBound = false;

/** 操盘端：订阅 TRADE 频道接收 query 回复（对齐 TradeView onMounted） */
export async function ensureTradeReplyChannel(adminUserId: number) {
  await ensureGoEasyConnected();
  if (tradeReplyBound)
    return;
  tradeReplyBound = true;
  await goeasySubscribe(tradeChannel(adminUserId), (raw) => {
    try {
      const envelope = JSON.parse(raw) as { msgId?: string; content?: unknown };
      if (envelope.msgId)
        goeasySetReply(envelope.msgId, envelope.content);
    }
    catch {
      /* ignore */
    }
  });
}

/** 向远程用户拉取账号列表 */
export async function queryRemoteAccounts(
  adminUserId: number,
  remoteUserId: number,
  provider: PlatformId,
): Promise<TradeRemoteAccount[]> {
  const msgId = newMsgId();
  const reply = tradeChannel(adminUserId);
  const payload = JSON.stringify({
    action: "query",
    info: {
      type: "accounts",
      reply,
      msgId,
      data: { provider },
    },
  });
  const result = await goeasyRequestReply(userChannel(remoteUserId), msgId, payload);
  if (!result)
    return [];
  if (Array.isArray(result))
    return result as TradeRemoteAccount[];
  return [];
}

/** 远程修改账号字段 */
export async function patchRemoteAccount(
  remoteUserId: number,
  accountId: number,
  field: string,
  account: TradeRemoteAccount,
) {
  const info: Record<string, unknown> = { accountId };
  switch (field) {
    case "pause":
      info.pause = account.pause;
      break;
    case "lastOdds":
      info.lastOdds = account.lastOdds;
      break;
    default:
      info[field] = account[field as keyof TradeRemoteAccount];
      break;
  }
  await goeasyPublish(
    userChannel(remoteUserId),
    JSON.stringify({ action: "account", info }),
  );
}
