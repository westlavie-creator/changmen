/** 浏览器直连上游推送（WS / MQTT）的运行时状态，供网页角标等读取 */
export type DirectRealtimeStatus = {
  platform: string;
  upstreamConnected: boolean;
  messagesReceived?: number;
  lastError?: string | null;
  lastUpstreamAt?: number | null;
  forwardedTopics?: number;
  mode: "direct";
};

const EMPTY = (platform: string): DirectRealtimeStatus => ({
  platform,
  upstreamConnected: false,
  messagesReceived: 0,
  lastError: null,
  lastUpstreamAt: null,
  forwardedTopics: 0,
  mode: "direct",
});

/** IA / OB / RAY / TF 使用本模块（浏览器直连，不经 A8 聚合 Socket） */
export const DIRECT_REALTIME_PLATFORMS = ["IA", "OB", "RAY", "TF"] as const;

export type DirectRealtimePlatformId = (typeof DIRECT_REALTIME_PLATFORMS)[number];

const statusByPlatform = new Map<string, DirectRealtimeStatus>();
const listeners = new Set<() => void>();

function notifyDirectRealtimeListeners(): void {
  for (const listener of listeners) listener();
}

/** 订阅状态变更（connect / 消息 / 错误）；返回取消函数 */
export function subscribeDirectRealtimeStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function listDirectRealtimeStatuses(): DirectRealtimeStatus[] {
  return DIRECT_REALTIME_PLATFORMS.map((platform) => getDirectRealtimeStatus(platform));
}

export function patchDirectRealtimeStatus(
  platform: string,
  patch: Partial<Omit<DirectRealtimeStatus, "platform" | "mode">>,
): void {
  const prev = statusByPlatform.get(platform) ?? EMPTY(platform);
  statusByPlatform.set(platform, { ...prev, ...patch, platform, mode: "direct" });
  notifyDirectRealtimeListeners();
}

export function bumpDirectRealtimeMessage(platform: string): void {
  const prev = statusByPlatform.get(platform) ?? EMPTY(platform);
  patchDirectRealtimeStatus(platform, {
    messagesReceived: (prev.messagesReceived ?? 0) + 1,
    lastUpstreamAt: Date.now(),
  });
}

export function getDirectRealtimeStatus(platform: string): DirectRealtimeStatus {
  return statusByPlatform.get(platform) ?? EMPTY(platform);
}

export function resetDirectRealtimeStatus(platform: string): void {
  statusByPlatform.set(platform, EMPTY(platform));
  notifyDirectRealtimeListeners();
}
