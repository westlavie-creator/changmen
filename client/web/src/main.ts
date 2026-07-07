import ElementPlus from "element-plus";
import zhCn from "element-plus/es/locale/lang/zh-cn";
import "element-plus/dist/index.css";
import "element-plus/theme-chalk/dark/css-vars.css";
import { createPinia } from "pinia";
import { createApp } from "vue";
import { initGamebetExtension } from "@/chrome-plugin/bridge";
import { installClientCoreBridges } from "@/runtime/installClientCore";
import { installVenueWebBridge } from "@/runtime/installVenueWebBridge";
import { clearChunkReloadFlag, installChunkReloadOnDeploy } from "@/shared/chunkReload";
import { useUserStore } from "@/stores/userStore";
import "@/styles/index.css";
import App from "./App.vue";
import router from "./router";

function bootstrap() {
  installChunkReloadOnDeploy();
  clearChunkReloadFlag();
  const pinia = createPinia();
  const app = createApp(App).use(pinia).use(router).use(ElementPlus, { locale: zhCn });
  installVenueWebBridge();
  installClientCoreBridges();
  app.mount("#app");
  void initGamebetExtension();
  void useUserStore(pinia).restoreSession();
}

bootstrap();
