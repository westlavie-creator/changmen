import { PLATFORMS } from "./platforms.js";
import { initPbLiveHttp } from "./pb/live-http.js";
import { initPbWsObserve } from "./pb/init.js";
import { installTabProxyListener, registerTabHandler } from "./tab-proxy.js";

/** document_start：F5 后 localStorage 仍在，尽早挂活标签代发 */
installTabProxyListener();
initPbLiveHttp((handler) => {
  registerTabHandler(PLATFORMS.PB, handler);
});
initPbWsObserve();
