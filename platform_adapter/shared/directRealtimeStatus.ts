/** 浏览器直连平台 WS 的状态（供 Electron 右上角面板等读取） */
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

const statusByPlatform = new Map<string, DirectRealtimeStatus>();

export function patchDirectRealtimeStatus(
  platform: string,
  patch: Partial<Omit<DirectRealtimeStatus, "platform" | "mode">>,
): void {
  const prev = statusByPlatform.get(platform) ?? EMPTY(platform);
  statusByPlatform.set(platform, { ...prev, ...patch, platform, mode: "direct" });
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
}
