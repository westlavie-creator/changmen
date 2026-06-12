import { postFormUrlEncoded, sleep } from "./utils.js";

/** 对齐 A8 HGA `Ie` / `De` — 注单监听并上报 A8 聚合 API */
const SAVE_URL = "https://api.a8.to/Common/API_SaveData";

let maxId = 0;
let pollCount = 0;
const wagers = [];
let pollStarted = false;

function wagerTimeMs(w) {
  const dt = new Date(`${w.DATE} ${w.TIME}`);
  dt.setHours(dt.getHours() + 12);
  return dt.getTime();
}

async function saveWagers(username, rows) {
  if (!rows.length) return;
  await postFormUrlEncoded(`${SAVE_URL}?key=HG:${encodeURIComponent(username)}`, {
    content: JSON.stringify(rows),
  });
}

async function pollLoop(gateway, uid, ver, username) {
  if (!uid || !ver) return;
  const confirmBtn = document.querySelector(".gamebet-collect-panel-confirm");
  for (;;) {
    try {
      const url = `${gateway}/transform.php?ver=${ver}`;
      const data = await postFormUrlEncoded(url, {
        login_layer: "ag",
        uid,
        langx: "zh-cn",
        ver,
        p: "get_wmc_list_bet",
        totalBets: "wmc",
        gtype: "ALL",
        sel_maxid: String(maxId),
      });
      if (data?.maxid) maxId = data.maxid;
      if (data?.wagers?.length) {
        const cutoff = Date.now() - 600_000;
        for (const w of data.wagers) {
          if (!wagers.some((x) => x.TID === w.TID)) wagers.push(w);
        }
        await saveWagers(
          username,
          wagers.filter((w) => wagerTimeMs(w) > cutoff),
        );
      }
    } catch (err) {
      console.warn("[HGA] poll error", err);
    } finally {
      pollCount += 1;
      if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = `第${pollCount}次监听`;
      }
      await sleep(3000);
    }
  }
}

/** 首次 GetConfig 成功后启动（对齐 `Be` 单次门闩） */
export function maybeStartHgaPoll(meta) {
  if (pollStarted || !meta?.uid || !meta?.ver || !meta?.username) return;
  pollStarted = true;
  void pollLoop(meta.gateway, meta.uid, meta.ver, meta.username);
}
