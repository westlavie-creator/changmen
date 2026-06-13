import { createRouter, createWebHistory } from "vue-router";
import { getToken } from "@/api/esport";
import { useUserStore } from "@/stores/userStore";

const router = createRouter({
  history: createWebHistory("/"),
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
      path: "/admin",
      name: "admin",
      component: () => import("@/views/AdminView.vue"),
      meta: { requiresAdmin: true },
    },
    {
      path: "/admin/users",
      name: "admin-users",
      component: () => import("@/views/AdminUsersView.vue"),
      meta: { requiresAdmin: true },
    },
    {
      path: "/admin/orders",
      name: "admin-orders",
      component: () => import("@/views/AdminOrdersView.vue"),
      meta: { requiresAdmin: true },
    },
    {
      path: "/console/:pathMatch(.*)*",
      name: "console-redirect",
      component: () => import("@/views/ConsoleRedirectView.vue"),
      meta: { public: true },
    },
  ],
});

router.beforeEach(async (to) => {
  if (to.meta.public) return true;
  if (!getToken()) return { name: "login", query: { redirect: to.fullPath } };
  if (to.meta.requiresAdmin) {
    const user = useUserStore();
    if (!user.ready) {
      try {
        await user.fetchUserInfo();
      } catch {
        return { name: "login", query: { redirect: to.fullPath } };
      }
    }
    if (!user.isAdmin) return { name: "home" };
  }
  return true;
});

export default router;
