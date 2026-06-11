/**
 * Electron loadExtension 不提供 chrome.storage.sync。
 * 部分 Chromium 扩展 API（含 storage 变更监听）仍会 touch sync 并报错。
 * 将 sync 指向 local，与 redux-devtools 等扩展在 Electron 中的做法一致。
 */
export function patchChromeStorageForElectron() {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return;

  let syncMissing = false;
  try {
    syncMissing = !chrome.storage.sync;
  } catch {
    syncMissing = true;
  }
  if (!syncMissing) return;

  try {
    Object.defineProperty(chrome.storage, "sync", {
      value: chrome.storage.local,
      configurable: true,
      enumerable: false,
    });
  } catch {
    try {
      chrome.storage.sync = chrome.storage.local;
    } catch {
      /* ignore */
    }
  }
}

patchChromeStorageForElectron();
