/**
 * IM / XBet / Stake 曾经 A8 Socket.IO 聚合（47.115.75.57）收频道推送。
 * 已禁用对该主机的连接；订阅为 no-op（Stake 仍可用 GraphQL 轮询）。
 */

type ChannelHandler = (message: unknown) => void;

/** @deprecated A8 聚合 WS 已移除 */
export const DEFAULT_A8_WS = "";

export async function subscribeA8Channel(
  _channel: string,
  _handler: ChannelHandler,
): Promise<() => void> {
  return () => {};
}
