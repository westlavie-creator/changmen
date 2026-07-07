import { vi } from "vitest";

/** 单测共享 fo 缓存；替代 mock useOddsStore（ViewBetItem 经 client-core 桥接读赔率） */
export const foOddsState: { current: Record<string, Record<string, number>> } = {
  current: {},
};

vi.mock("@changmen/client-core/bridge/oddsAccess", () => ({
  readVenueOdds: (type: string, id: string, fallback: number) =>
    foOddsState.current[type]?.[id] ?? fallback,
  writeVenueOdds: vi.fn(),
  registerOddsAccess: vi.fn(),
  clearOddsAccess: vi.fn(),
}));
