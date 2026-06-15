import { describe, expect, it } from "vitest";
import {
  getGameCodeForPlatformId,
  resolveClientGame,
} from "@changmen/shared/catalog/game_catalog.mjs";

describe("game_catalog IA mappings", () => {
  it("maps IA native game id 3 to CS2", () => {
    expect(getGameCodeForPlatformId("IA", "3")).toBe("cs2");
    expect(resolveClientGame("IA", "3")).toEqual({ Game: "CS:GO", GameID: 3 });
  });

  it("maps IA native game id 1 to League of Legends", () => {
    expect(getGameCodeForPlatformId("IA", "1")).toBe("lol");
    expect(resolveClientGame("IA", "1")).toEqual({ Game: "英雄联盟", GameID: 1 });
  });

  it("maps IA native game ids for Valorant and Dota 2", () => {
    expect(getGameCodeForPlatformId("IA", "43")).toBe("valorant");
    expect(resolveClientGame("IA", "43")).toEqual({ Game: "无畏契约", GameID: 8 });
    expect(getGameCodeForPlatformId("IA", "2")).toBe("dota2");
    expect(resolveClientGame("IA", "2")).toEqual({ Game: "DOTA2", GameID: 2 });
  });
});
