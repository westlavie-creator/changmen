import { createApp } from "vue";
import { createPinia } from "pinia";
import ElementPlus from "element-plus";
import zhCn from "element-plus/es/locale/lang/zh-cn";
import App from "./App.vue";
import router from "./router";
import { initGamebetExtension } from "@/chrome-plugin/bridge";
import { useUserStore } from "@/stores/userStore";
import { loadStylesForBootstrap } from "@/lib/copyShell";

async function bootstrap() {
  await loadStylesForBootstrap();

  const pinia = createPinia();
  const app = createApp(App).use(pinia).use(router).use(ElementPlus, { locale: zhCn });
  app.mount("#app");
  void initGamebetExtension();
  void useUserStore(pinia).restoreSession();
}

bootstrap().catch(console.error);
