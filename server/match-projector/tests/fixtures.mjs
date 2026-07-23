import { setTeamPlugin } from "@changmen/match-engine";

export const GB_NIP = "100631";
export const GB_K27 = "100297";
export const GB_FOO = "100001";
export const GB_BAR = "100002";

const idMap = {
  "OB:ob-nip": GB_NIP,
  "OB:ob-k27": GB_K27,
  "RAY:ray-nip": GB_NIP,
  "RAY:ray-k27": GB_K27,
  "IA:ia-nip": GB_NIP,
  "IA:ia-k27": GB_K27,
  "Polymarket:pm-nip": GB_NIP,
  "Polymarket:pm-k27": GB_K27,
  "PredictFun:pf-nip": GB_NIP,
  "PredictFun:pf-k27": GB_K27,
  "PB:pb-nip": GB_NIP,
  "PB:pb-k27": GB_K27,
  "OB:ob-foo": GB_FOO,
  "OB:ob-bar": GB_BAR,
};

const names = {
  [GB_NIP]: "Ninjas in Pyjamas",
  [GB_K27]: "K27",
  [GB_FOO]: "Foo",
  [GB_BAR]: "Bar",
};

export function installPlugin() {
  setTeamPlugin({
    lookupById: (p, id) => idMap[`${p}:${id}`] || null,
    lookupByName: () => null,
    lookupCanonicalName: gb => names[gb] || null,
    lookupGameForGbTeamId: () => "cs2",
  });
}

export const pmOb = {
  SourceMatchID: "ob1",
  Home: "Ninjas in Pyjamas",
  Away: "K27",
  HomeID: "ob-nip",
  AwayID: "ob-k27",
  SourceGameID: "3",
};

export const pmRay = {
  SourceMatchID: "ray1",
  Home: "NiP",
  Away: "K27",
  HomeID: "ray-nip",
  AwayID: "ray-k27",
  SourceGameID: "3",
};

/** RAY native 翻转：K27 主 */
export const pmRayFlipped = {
  SourceMatchID: "ray1",
  Home: "K27",
  Away: "NiP",
  HomeID: "ray-k27",
  AwayID: "ray-nip",
  SourceGameID: "3",
};

export const pmPm = {
  SourceMatchID: "pm1",
  Home: "Ninjas in Pyjamas",
  Away: "K27",
  HomeID: "pm-nip",
  AwayID: "pm-k27",
  SourceGameID: "3",
};

export const pmPf = {
  SourceMatchID: "pf1",
  Home: "Ninjas in Pyjamas",
  Away: "K27",
  HomeID: "pf-nip",
  AwayID: "pf-k27",
  SourceGameID: "3",
};

export const pmIa = {
  SourceMatchID: "ia1",
  Home: "NiP",
  Away: "K27",
  HomeID: "ia-nip",
  AwayID: "ia-k27",
  SourceGameID: "3",
};

export function raw(type, homeOid, awayOid, betId = "b0") {
  return {
    Type: type,
    BetID: betId,
    HomeID: homeOid,
    AwayID: awayOid,
    HomeOdds: 1.5,
    AwayOdds: 2.5,
    Status: "Normal",
  };
}

export const rawOb = raw("OB", "oid-nip", "oid-k27", "m0");
export const rawRay = raw("RAY", "roid-nip", "roid-k27", "r0");
export const rawRayFlipped = raw("RAY", "roid-k27", "roid-nip", "r0");
export const rawPm = raw("Polymarket", "pmid-nip", "pmid-k27", "p0");
export const rawIa = raw("IA", "iaoid-nip", "iaoid-k27", "i0");

/** accumulate 工厂：platform → mapNum → raw */
export function makeAccumulate(table) {
  return (platform) => ({
    Bets: Object.entries(table[platform] || {}).map(([map, src]) => ({
      Map: Number(map),
      Sources: { [platform]: { ...src } },
    })),
  });
}

export function baseMatches(extra = {}) {
  return {
    OB: { ob1: pmOb },
    RAY: { ray1: pmRay },
    ...extra,
  };
}
