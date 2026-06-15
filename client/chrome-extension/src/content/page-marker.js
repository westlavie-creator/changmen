/** 页面侧识别扩展：不依赖固定 extension ID（见 client/web extension bridge） */
try {
  const manifest = chrome.runtime.getManifest();
  const root = document.documentElement;
  root.dataset.gamebetExtId = chrome.runtime.id;
  root.dataset.gamebetExtVersion = manifest.version ?? "";
} catch {
  /* 非扩展上下文 */
}
