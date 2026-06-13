import { createApp } from "vue";
import { createPinia } from "pinia";
import ElementPlus from "element-plus";
import zhCn from "element-plus/es/locale/lang/zh-cn";
import App from "./App.vue";
import router from "./router";
import { initGamebetExtension } from "@/extension/bridge";
import { useUserStore } from "@/stores/userStore";
import "./styles/a8.css";
import "./styles/login-carousel.css";
import "./styles/a8-fallback.css";
import "./styles/a8-am-icon.css";
import "./styles/a8-icon-fallback.css";
import "./styles/user-diag.css";
import "./styles/app.css";
import "./styles/admin-theme.css";

async function bootstrap() {
  await initGamebetExtension();
  const pinia = createPinia();
  const app = createApp(App).use(pinia).use(router).use(ElementPlus, { locale: zhCn });
  await useUserStore(pinia).restoreSession();
  app.mount("#app");
}

bootstrap().catch(console.error);
