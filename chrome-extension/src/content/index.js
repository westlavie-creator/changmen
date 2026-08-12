import "./page-marker.js";
import { mountCollectIcon } from "./collect-ui.js";
import { maybeStartHgaPoll } from "./hga-poll.js";
import { PLATFORMS, PLATFORM_LIST } from "./platforms.js";
import { createProvider, PROVIDER_REGISTRY } from "./providers.js";
import { initDexPage } from "./dex/init.js";
import { initStakePage } from "./stake/init.js";
import { installTabProxyListener, registerTabHandler } from "./tab-proxy.js";
import { sleep } from "./utils.js";

const COLLECT_POLL_MS = 3000;
const COLLECT_MAX_ATTEMPTS = 120;

/** HGA GetConfig 后启动注单轮询 */
function wrapProviderForHga(provider) {
  const original = provider.GetConfig.bind(provider);
  provider.GetConfig = async () => {
    const config = await original();
    if (config?._hgaMeta) {
      maybeStartHgaPoll(config._hgaMeta);
      delete config._hgaMeta;
    }
    return config;
  };
  return provider;
}

async function tryMountCollectUi({ iframeOnlyObSport = false } = {}) {
  for (const platformId of PLATFORM_LIST) {
    if (iframeOnlyObSport && platformId !== PLATFORMS.OB) continue;
    const ProviderCls = PROVIDER_REGISTRY[platformId];
    if (!ProviderCls) continue;
    let provider = createProvider(platformId);
    if (!provider) continue;
    if (platformId === PLATFORMS.HGA) {
      provider = wrapProviderForHga(provider);
    }
    try {
      if (!(await provider.Check())) continue;
      if (iframeOnlyObSport && typeof provider.allowIframeMount === "function" && !provider.allowIframeMount()) {
        continue;
      }
      await mountCollectIcon(provider);
      return true;
    } catch (err) {
      console.warn("[Gamebet] provider check failed", platformId, err);
    }
  }
  return false;
}

async function detectAndMountCollectUi() {
  if (document.body?.querySelector(".gamebet-collect-float")) return;

  const iframeOnlyObSport = window !== window.top;
  // 非顶层：只尝试 OB 体育（电竞/其它馆仍禁止 iframe 挂载，避免误伤）
  for (let attempt = 0; attempt < COLLECT_MAX_ATTEMPTS; attempt++) {
    if (await tryMountCollectUi({ iframeOnlyObSport })) return;
    await sleep(COLLECT_POLL_MS);
  }
}

function bootstrap() {
  installTabProxyListener();

  initStakePage((handler) => {
    registerTabHandler(PLATFORMS.Stake, handler);
  });

  initDexPage((handler) => {
    registerTabHandler(PLATFORMS.Dex, handler);
  });

  const startDetect = () => void detectAndMountCollectUi();
  if (document.body) {
    startDetect();
  } else {
    document.addEventListener("DOMContentLoaded", startDetect, { once: true });
  }
}

bootstrap();
