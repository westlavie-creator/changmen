/**
 * 从快照剥离一切「已有 client_match」影响，只保留各馆原始赛事/赔率/计时。
 * 用于检验合场逻辑本身（非生产写库路径）。
 */
export function snapshotFromVenuesOnly(snapshot) {
  const matches = stripClientLinks(snapshot.matches || {});
  return {
    ...snapshot,
    matches,
    matchesRaw: snapshot.matchesRaw, // 仅调试；管线用 matches
    clientRows: [],
    alignClientRows: [],
    platformBindingsByClientId: null,
    platformOverrides: {},
    _fromVenuesOnly: true,
  };
}

function stripClientLinks(matches) {
  const out = {};
  for (const [platform, bucket] of Object.entries(matches || {})) {
    if (!bucket || typeof bucket !== "object")
      continue;
    out[platform] = {};
    for (const [sid, pm] of Object.entries(bucket)) {
      if (!pm || typeof pm !== "object")
        continue;
      const next = { ...pm };
      delete next.ClientMatchId;
      delete next.client_match_id;
      delete next.match_id;
      out[platform][sid] = next;
    }
  }
  return out;
}
