<script setup lang="ts">
import { computed, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useUserStore } from "@/stores/userStore";

defineProps<{
  title?: string;
  subtitle?: string;
}>();

const route = useRoute();
const router = useRouter();
const user = useUserStore();

const navItems = [
  { name: "admin", label: "数据概览", icon: "am-icon-dashboard", to: { name: "admin" as const } },
  { name: "admin-users", label: "用户管理", icon: "am-icon-users", to: { name: "admin-users" as const } },
  { name: "admin-orders", label: "订单查询", icon: "am-icon-list", to: { name: "admin-orders" as const } },
  {
    name: "admin-reports",
    label: "报表查询",
    icon: "am-icon-bar-chart",
    to: { name: "admin-reports" as const },
  },
];

const activeTab = computed(() => String(route.name || ""));

async function logout() {
  await user.logout();
  await router.push({ name: "home" });
}

onMounted(() => {
  document.documentElement.classList.add("admin-route");
  document.addEventListener("wheel", onAdminWheel, { passive: false, capture: true });
});
onUnmounted(() => {
  document.documentElement.classList.remove("admin-route");
  document.removeEventListener("wheel", onAdminWheel, { capture: true });
});

/** body overflow:hidden 时，el-table 会截获滚轮；订单页筛选栏等非表格区域也需滚动列表 */
function onAdminWheel(e: WheelEvent) {
  const target = e.target;
  if (!(target instanceof Element)) return;

  // 弹窗 / 抽屉 / MessageBox 内滚轮交给组件自身，勿劫持到订单列表
  if (
    target.closest(".el-overlay") ||
    target.closest(".el-dialog") ||
    target.closest(".el-drawer") ||
    target.closest(".el-message-box")
  ) {
    return;
  }

  if (!target.closest(".admin-shell")) return;

  if (!target.closest(".el-table")) return;

  const scrollEl = target.closest(".admin-shell__content");
  if (!(scrollEl instanceof HTMLElement)) return;

  const maxScroll = scrollEl.scrollHeight - scrollEl.clientHeight;
  if (maxScroll <= 0) return;

  scrollEl.scrollTop = Math.max(0, Math.min(maxScroll, scrollEl.scrollTop + e.deltaY));
  e.preventDefault();
}
</script>

<template>
  <div class="admin-shell">
    <aside class="admin-shell__sidebar">
      <div class="admin-shell__brand">
        <i class="admin-shell__brand-icon am-icon-shield" aria-hidden="true" />
        <div class="admin-shell__brand-text">
          <span class="admin-shell__brand-title">GameBet</span>
          <span class="admin-shell__brand-sub">管理后台</span>
        </div>
      </div>

      <nav class="admin-shell__nav" aria-label="后台导航">
        <router-link
          v-for="item in navItems"
          :key="item.name"
          :to="item.to"
          class="admin-shell__nav-item"
          :class="{ 'admin-shell__nav-item--active': activeTab === item.name }"
        >
          <i :class="item.icon" class="admin-shell__nav-icon" aria-hidden="true" />
          <span>{{ item.label }}</span>
        </router-link>
      </nav>

      <div class="admin-shell__sidebar-foot">
        <button type="button" class="admin-shell__back" @click="router.push({ name: 'home' })">
          <i class="am-icon-arrow-left admin-shell__back-icon" aria-hidden="true" />
          返回控制台
        </button>
      </div>
    </aside>

    <div class="admin-shell__main">
      <header class="admin-shell__topbar">
        <div class="admin-shell__topbar-left">
          <h1 class="admin-shell__page-title">{{ title || "管理后台" }}</h1>
          <p v-if="subtitle" class="admin-shell__page-sub">{{ subtitle }}</p>
        </div>
        <div class="admin-shell__topbar-right">
          <slot name="toolbar" />
          <div class="admin-shell__user">
            <span class="admin-shell__user-name">{{ user.userName }}</span>
            <el-tag v-if="user.isAdmin" size="small" type="warning" effect="dark">管理员</el-tag>
            <el-button size="small" type="info" plain @click="logout">退出</el-button>
          </div>
        </div>
      </header>

      <div class="admin-shell__content">
        <slot />
      </div>
    </div>
  </div>
</template>
