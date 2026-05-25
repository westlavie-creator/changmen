import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
import "./styles/a8.css";
import "./styles/a8-fallback.css";
import "./styles/app.css";

createApp(App).use(createPinia()).use(router).mount("#app");
