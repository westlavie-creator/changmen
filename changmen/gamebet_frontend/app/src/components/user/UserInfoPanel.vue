<script setup lang="ts">
import { ref } from "vue";
import { storeToRefs } from "pinia";
import UserConfigDialog from "@/components/user/UserConfigDialog.vue";
import UserDiagDialog from "@/components/user/UserDiagDialog.vue";
import { useUserStore } from "@/stores/userStore";
import { useAccountStore } from "@/stores/accountStore";
import { useConfigStore } from "@/stores/configStore";
import { useBettingStore } from "@/stores/bettingStore";

const emit = defineEmits<{ logout: [] }>();

const user = useUserStore();
const accountStore = useAccountStore();
const configStore = useConfigStore();
const bettingStore = useBettingStore();
const { displayName, apiDelay, delayLevel } = storeToRefs(user);
const { totalBalance, totalToday, totalOrders } = storeToRefs(accountStore);
const { config } = storeToRefs(configStore);
const { lastMessage } = storeToRefs(bettingStore);

const configOpen = ref(false);
const userDiagOpen = ref(false);
</script>

<template>
  <section class="userinfo">
    <div class="info flex flex-between flex-middle">
      <div class="userName">
        <div class="btn-group">
          <button type="button" class="ui-btn ui-btn--primary ui-btn--sm" @click="userDiagOpen = !userDiagOpen">
            {{ displayName }}
          </button>
          <button
            type="button"
            class="ui-btn ui-btn--sm"
            :class="`ui-btn--${delayLevel}`"
            @click="user.toggleHiddenUserName()"
          >
            {{ apiDelay }}<span class="ms">ms</span>
          </button>
        </div>
      </div>
      <div class="actions flex">
        <div class="btn-group">
          <button
            type="button"
            class="ui-btn ui-btn--primary ui-btn--sm ui-btn--icon am-icon-plus"
            title="添加账号"
            aria-label="添加账号"
            @click="accountStore.openCreateAccount()"
          />
          <button
            type="button"
            class="ui-btn ui-btn--sm ui-btn--icon am-icon-gear"
            :class="config.betting ? 'ui-btn--primary' : 'ui-btn--danger'"
            title="参数配置"
            aria-label="参数配置"
            @click="configOpen = true"
          />
          <button
            type="button"
            class="ui-btn ui-btn--sm ui-btn--icon ui-btn--info am-icon-power-off"
            title="退出登录"
            aria-label="退出登录"
            @click="emit('logout')"
          />
        </div>
      </div>
    </div>

    <div class="report">
      <div class="report-grid">
        <div class="report-number">
          <span class="report-number__title">总余额</span>
          <span class="report-number__value">{{
            totalBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })
          }}</span>
        </div>
        <div class="report-number">
          <span class="report-number__title">当日盈亏</span>
          <span class="report-number__value">{{
            totalToday.toLocaleString(undefined, { maximumFractionDigits: 0 })
          }}</span>
        </div>
        <div class="report-number">
          <span class="report-number__title">订单数量</span>
          <span class="report-number__value">{{ totalOrders }}</span>
        </div>
      </div>
    </div>

    <p v-if="config.betting" class="betting-status betting-status--on">自动投注已开启</p>
    <p v-if="lastMessage" class="betting-hint">{{ lastMessage }}</p>

    <UserConfigDialog :open="configOpen" @close="configOpen = false" />
    <UserDiagDialog :open="userDiagOpen" @close="userDiagOpen = false" />
  </section>
</template>

<style scoped>
.user-panel {
  padding: 12px 14px;
  border-bottom: 1px solid #ffffff14;
  background: #00000040;
}
.info {
  margin-bottom: 10px;
}
.btn-group {
  display: inline-flex;
  gap: 0;
}
.btn-group .ui-btn {
  border-radius: 0;
}
.btn-group .ui-btn:first-child {
  border-radius: 4px 0 0 4px;
}
.btn-group .ui-btn:last-child {
  border-radius: 0 4px 4px 0;
  border-left: none;
}
.ui-btn {
  border: 1px solid #475569;
  background: #1e293b;
  color: #e2e8f0;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  padding: 7px 12px;
}
.ui-btn--sm {
  padding: 6px 10px;
  min-height: 28px;
}
.ui-btn--icon {
  width: 32px;
  padding: 6px;
  font-size: 14px;
}
.ui-btn--primary {
  background: #059669;
  border-color: #059669;
  color: #fff;
}
.ui-btn--danger {
  background: #dc2626;
  border-color: #dc2626;
  color: #fff;
}
.ui-btn--info {
  background: #64748b;
  border-color: #64748b;
  color: #fff;
}
.ui-btn--ok {
  background: #059669;
  border-color: #059669;
  color: #fff;
}
.ui-btn--warn {
  background: #d97706;
  border-color: #d97706;
  color: #fff;
}
.ui-btn--bad {
  background: #dc2626;
  border-color: #dc2626;
  color: #fff;
}
.ui-btn--none {
  background: #334155;
}
.ms {
  margin-left: 2px;
  font-size: 10px;
  opacity: 0.85;
}
.report-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}
.report-number {
  text-align: center;
  padding: 4px 2px;
}
.report-number__title {
  display: block;
  font-size: 11px;
  color: #64748b;
}
.report-number__value {
  font-size: 13px;
  color: #cbd5e1;
}
.betting-status {
  font-size: 11px;
  margin: 8px 0 4px;
}
.betting-status--on {
  color: #34d399;
}
.betting-hint {
  font-size: 10px;
  color: #94a3b8;
  margin: 0;
  line-height: 1.4;
}
/* 复用 a8.css 图标字体 */
.am-icon-plus::before {
  content: "+";
  font-weight: 700;
}
.am-icon-gear::before {
  content: "⚙";
}
.am-icon-power-off::before {
  content: "⏻";
}
</style>
