/**
 * POD /events/{id} periods → 逐档 NVP。无 Chrome API，可单测。
 * power 去水对齐 AutoYabo calculateNoVig("power")。
 */

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function calculateNoVig(a, b) {
  const x = parseFloat(a);
  const y = parseFloat(b);
  if (isNaN(x) || isNaN(y) || x <= 1 || y <= 1)
    return 0;
  const implied = [1 / x, 1 / y];
  let k = 1;
  let powered = implied.map((p) => Math.pow(p, k));
  for (let i = 0; i < 100; i++) {
    const err = powered.reduce((s, p) => s + p, 0) - 1;
    const deriv = implied.reduce((s, p) => s + Math.log(p) * Math.pow(p, k), 0);
    if (!deriv)
      break;
    k -= err / deriv;
    powered = implied.map((p) => Math.pow(p, k));
    if (Math.abs(err) < 0.0001)
      break;
  }
  const nvp = 1 / powered[0];
  if (!Number.isFinite(nvp) || nvp <= 1)
    return 0;
  return parseFloat(nvp.toFixed(3));
}

function mapLine(eventId, row) {
  const market = String(row && row.market || "").toLowerCase();
  const line = Number(row && row.line);
  if (!eventId || (market !== "spreads" && market !== "totals" && market !== "moneyline"))
    return null;
  if (!Number.isFinite(line))
    return null;
  const home = num(row.home);
  const away = num(row.away);
  const over = num(row.over);
  const under = num(row.under);
  return {
    eventId: String(eventId),
    period: num(row.period),
    market,
    line,
    nvpHome: home > 1 && away > 1 ? calculateNoVig(home, away) : 0,
    nvpAway: home > 1 && away > 1 ? calculateNoVig(away, home) : 0,
    nvpOver: over > 1 && under > 1 ? calculateNoVig(over, under) : 0,
    nvpUnder: over > 1 && under > 1 ? calculateNoVig(under, over) : 0,
  };
}

/**
 * @param {unknown} events
 * @returns {Record<string, unknown>[]}
 */
export function mapPodBookEvents(events) {
  if (!Array.isArray(events))
    return [];
  const out = [];
  for (const event of events) {
    if (!event || typeof event !== "object")
      continue;
    const eventId = String(event.eventId || "");
    const lines = Array.isArray(event.lines) ? event.lines : [];
    for (const row of lines) {
      const mapped = mapLine(eventId, row);
      if (mapped)
        out.push(mapped);
    }
  }
  return out;
}
