/**
 * 控制台格式化输出。
 */

/**
 * @param {import("../engine/scanner.js").MatchSignal[]} signals
 */
export function formatSignalTable(signals) {
  if (!signals.length) return "  (无正EV信号)";

  const lines = [];
  lines.push(
    padR("比赛", 28) +
    padR("盘口", 12) +
    padR("软盘", 6) +
    padR("方向", 6) +
    padR("软赔率", 8) +
    padR("公平赔率", 8) +
    padR("Edge%", 8) +
    padR("Kelly%", 8) +
    padR("PB线", 16),
  );
  lines.push("─".repeat(100));

  for (const s of signals) {
    const sig = s.signal;
    const title = truncate(s.title, 26);
    const betLabel = s.map > 0 ? `M${s.map} ${s.betName}` : s.betName;
    lines.push(
      padR(title, 28) +
      padR(truncate(betLabel, 10), 12) +
      padR(sig.softPlatform, 6) +
      padR(sig.side === "Home" ? "主" : "客", 6) +
      padR(sig.softOdds.toFixed(3), 8) +
      padR(sig.fairOdds.toFixed(3), 8) +
      padR((sig.edge * 100).toFixed(2) + "%", 8) +
      padR((sig.kellyFrac * 100).toFixed(2) + "%", 8) +
      padR(`${sig.sharpHome.toFixed(3)}/${sig.sharpAway.toFixed(3)}`, 16),
    );
  }

  return lines.join("\n");
}

function padR(s, n) {
  s = String(s);
  const w = [...s].reduce((sum, ch) => sum + (ch.charCodeAt(0) > 0x7f ? 2 : 1), 0);
  return s + " ".repeat(Math.max(0, n - w));
}

function truncate(s, n) {
  if (!s) return "";
  let w = 0;
  let i = 0;
  for (; i < s.length; i++) {
    const cw = s.charCodeAt(i) > 0x7f ? 2 : 1;
    if (w + cw > n - 2) return s.slice(0, i) + "..";
    w += cw;
  }
  return s;
}
