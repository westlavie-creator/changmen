import ElementPlus from "element-plus";
import zhCn from "element-plus/es/locale/lang/zh-cn";
import { createPinia } from "pinia";
import { createApp } from "vue";
import { initGamebetExtension } from "@/chrome-plugin/bridge";
import { loadStylesForBootstrap } from "@/lib/copyShell";
import { useUserStore } from "@/stores/userStore";
import App from "./App.vue";
import router from "./router";

async function bootstrap() {
  await loadStylesForBootstrap();

  const pinia = createPinia();
  const app = createApp(App).use(pinia).use(router).use(ElementPlus, { locale: zhCn });
  app.mount("#app");
  void initGamebetExtension();
  void useUserStore(pinia).restoreSession();
}

bootstrap().catch(console.error);
