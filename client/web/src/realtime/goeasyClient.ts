import GoEasy from "goeasy";
import { wait } from "@changmen/client-core/shared/wait";

/** 对齐 A8 bundle `N8e` / `hangzhou.goeasy.io` */
const GOEASY_APPKEY = "BC-f7e9e309dbe5400eb34041afd4a0c6ad";
const GOEASY_HOST = "hangzhou.goeasy.io";

interface GoEasyMessage { content?: string }
interface PubSubLike {
  subscribe: (opts: {
    channel: string;
    onMessage: (msg: GoEasyMessage) => void;
    onSuccess?: () => void;
    onFailed?: (err: { content?: string }) => void;
  }) => void;
  publish: (opts: {
    channel: string;
    message: string;
    onSuccess?: () => void;
    onFailed?: (err: { content?: string }) => void;
  }) => void;
  unsubscribe?: (opts: { channel: string }) => void;
}

interface GoEasyInstance {
  connect: (opts: {
    onSuccess?: () => void;
    onFailed?: (err: { code?: number; content?: string }) => void;
  }) => void;
  pubsub: PubSubLike;
}

let instance: GoEasyInstance | null = null;
let connectPromise: Promise<void> | null = null;

function getGoEasy(): GoEasyInstance {
  if (!instance) {
    instance = GoEasy.getInstance({
      host: GOEASY_HOST,
      appkey: GOEASY_APPKEY,
      modules: ["pubsub"],
    }) as unknown as GoEasyInstance;
  }
  return instance;
}

/** 对齐 A8 `W8e`：连接 GoEasy（BetTarget / 操盘 / USER 通道共用） */
export function ensureGoEasyConnected(): Promise<void> {
  if (connectPromise)
    return connectPromise;
  connectPromise = new Promise((resolve, reject) => {
    getGoEasy().connect({
      onSuccess: () => resolve(),
      onFailed: (err) => {
        connectPromise = null;
        reject(new Error(err?.content || "GoEasy 连接失败"));
      },
    });
  });
  return connectPromise;
}

/** 对齐 A8 `lv` */
export function goeasySubscribe(
  channel: string,
  onMessage: (content: string) => void,
): Promise<void> {
  return ensureGoEasyConnected().then(
    () =>
      new Promise((resolve, reject) => {
        getGoEasy().pubsub.subscribe({
          channel,
          onMessage: msg => onMessage(String(msg?.content ?? "")),
          onSuccess: () => resolve(),
          onFailed: err => reject(new Error(err?.content || "订阅失败")),
        });
      }),
  );
}

export function goeasyUnsubscribe(channel: string) {
  getGoEasy().pubsub.unsubscribe?.({ channel });
}

/** 对齐 A8 `ax` */
export function goeasyPublish(channel: string, message: string): Promise<boolean> {
  return ensureGoEasyConnected().then(
    () =>
      new Promise((resolve) => {
        getGoEasy().pubsub.publish({
          channel,
          message,
          onSuccess: () => resolve(true),
          onFailed: () => resolve(false),
        });
      }),
  );
}

const replyWaiters = new Map<string, unknown>();

/** 对齐 A8 `L8e` */
export function goeasySetReply(msgId: string, content: unknown) {
  replyWaiters.set(msgId, content);
}

/** 对齐 A8 `U8e`：发布并等待对端经 reply 频道回传 msgId */
export async function goeasyRequestReply(
  channel: string,
  msgId: string,
  payload: string,
  timeoutMs = 3000,
): Promise<unknown> {
  if (!(await goeasyPublish(channel, payload)))
    return undefined;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (replyWaiters.has(msgId)) {
      const value = replyWaiters.get(msgId);
      replyWaiters.delete(msgId);
      return value;
    }
    await wait(10);
  }
  return undefined;
}

export function newMsgId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
