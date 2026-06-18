import { createRouter, createWebHistory } from "vue-router";
import { getToken } from "@/api/esport";
import { useUserStore } from "@/stores/userStore";
import GateView from "@/views/GateView.vue";

const router = createRouter({
  history: createWebHistory("/"),
  routes: [
    {
      path: "/login",
      redirect: () => "/",
    },
    {
      path: "/copy",
      redirect: () => "/",
    },
    {
      path: "/",
      name: "home",
      component: GateView,
      meta: { public: true },
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
      path: "/admin/orders-matrix",
      name: "admin-orders-matrix",
      component: () => import("@/views/AdminOrdersMatrixView.vue"),
      meta: { requiresAdmin: true },
    },
    {
      path: "/admin/reports",
      name: "admin-reports",
      component: () => import("@/views/AdminReportsView.vue"),
      meta: { requiresAdmin: true },
    },
  ],
});

router.beforeEach(async (to) => {
  if (to.meta.public) return true;
  if (!getToken()) {
    if (to.fullPath !== "/") {
      sessionStorage.setItem("gamebet:postLoginRedirect", to.fullPath);
    }
    return { name: "home" };
  }
  if (to.meta.requiresAdmin) {
    const user = useUserStore();
    if (!user.ready) {
      try {
        await user.fetchUserInfo();
      } catch {
        return { name: "home" };
      }
    }
    if (!user.isAdmin) return { name: "home" };
  }
  return true;
});

export default router;
