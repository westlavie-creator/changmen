import { createRouter, createWebHistory } from "vue-router";
import { getToken } from "@/api/esport";

const router = createRouter({
  history: createWebHistory("/app/"),
  routes: [
    {
      path: "/login",
      name: "login",
      component: () => import("@/views/LoginView.vue"),
      meta: { public: true },
    },
    {
      path: "/",
      name: "home",
      component: () => import("@/views/HomeView.vue"),
    },
    {
      path: "/console/:pathMatch(.*)*",
      name: "console-redirect",
      component: () => import("@/views/ConsoleRedirectView.vue"),
      meta: { public: true },
    },
  ],
});

router.beforeEach((to) => {
  if (to.meta.public) return true;
  if (!getToken()) return { name: "login", query: { redirect: to.fullPath } };
  return true;
});

export default router;
