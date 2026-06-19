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

  it("maps IA native game id 16 to Honor of Kings", () => {
    expect(getGameCodeForPlatformId("IA", "16")).toBe("kog");
    expect(resolveClientGame("IA", "16")).toEqual({ Game: "王者荣耀", GameID: 4 });
  });
});

describe("game_catalog TF mappings", () => {
  it("maps TF native game id 14 to Honor of Kings", () => {
    expect(getGameCodeForPlatformId("TF", "14")).toBe("kog");
    expect(resolveClientGame("TF", "14")).toEqual({ Game: "王者荣耀", GameID: 4 });
  });

  it("still maps legacy TF game id 43 to Honor of Kings", () => {
    expect(getGameCodeForPlatformId("TF", "43")).toBe("kog");
    expect(resolveClientGame("TF", "43")).toEqual({ Game: "王者荣耀", GameID: 4 });
  });
});
