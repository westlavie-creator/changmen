/** One-off: tryPlay en + structureTournamentMatchesPB with app headers. */
function uuidNoDash() {
  return "xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const tryUrl = "https://api.dbsporxxxw1box.com/yewu6/user/tryPlay?lang=en&terminal=PC";
const tr = await fetch(tryUrl, {
  headers: { Accept: "application/json, text/plain, */*" },
  signal: AbortSignal.timeout(25000),
});
const tj = await tr.json();
const token = String(tj?.data?.token || "");
const loginUrl = String(tj?.data?.loginUrl || "");
console.log(JSON.stringify({
  tryCode: tj?.code,
  tokenLen: token.length,
  loginUrl,
  hasApiParam: /[?&]api=/.test(loginUrl),
}, null, 2));

const ts = Date.now();
const headers = {
  "Content-Type": "application/json",
  Accept: "application/json, text/plain, */*",
  lang: "en",
  requestId: token,
  checkId: `pc-${uuidNoDash()}--${ts}`,
  "request-code": "{\"panda-bss-source\":\"2\"}",
};
const url = `https://api.dbsporxxxw1box.com/yewu11/v1/w/structureTournamentMatchesPB?t=${Date.now()}`;
const body = { cuid: "", sort: 1, type: 3, device: "v2_h5", euid: "3020101" };
const res = await fetch(url, {
  method: "POST",
  headers,
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(30000),
});
const j = await res.json();
console.log(JSON.stringify({
  scheduleCode: j?.code,
  msg: j?.msg,
  dataNull: j?.data == null,
  sample: JSON.stringify(j).slice(0, 400),
}, null, 2));
