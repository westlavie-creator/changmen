/** 右上角角标：原生 WebSocket / 同类长连接的四态 */
export type VenueWsStatus = "disconnected" | "connecting" | "connected" | "error";

export type VenueWsStatusEntry = {
  id: string;
  label: string;
  status: VenueWsStatus;
};

const REGISTRY: ReadonlyArray<{ id: string; label: string }> = [
  { id: "pm-market", label: "PM-M" },
  { id: "pm-user", label: "PM-U" },
  { id: "dex", label: "DEX" },
  { id: "cm-hub", label: "HUB" },
];

const statusById = new Map<string, VenueWsStatus>(
  REGISTRY.map(row => [row.id, "disconnected" as VenueWsStatus]),
);
const listeners = new Set<() => void>();

function notifyVenueWsListeners(): void {
  for (const listener of listeners)
    listener();
}

/** 各 venue 模块在连接状态变化时上报 */
export function reportVenueWsStatus(id: string, status: VenueWsStatus): void {
  const prev = statusById.get(id);
  if (prev === status)
    return;
  statusById.set(id, status);
  notifyVenueWsListeners();
}

export function getVenueWsStatus(id: string): VenueWsStatus {
  return statusById.get(id) ?? "disconnected";
}

export function listVenueWsStatuses(): VenueWsStatusEntry[] {
  return REGISTRY.map(({ id, label }) => ({
    id,
    label,
    status: getVenueWsStatus(id),
  }));
}

export function subscribeVenueWsStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 单测重置 */
export function resetVenueWsStatusesForTests(): void {
  for (const { id } of REGISTRY)
    statusById.set(id, "disconnected");
  notifyVenueWsListeners();
}
