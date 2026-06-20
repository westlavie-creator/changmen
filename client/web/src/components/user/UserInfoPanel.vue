<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { useTransition } from "@vueuse/core";
import UserConfigDialog from "@/components/user/UserConfigDialog.vue";
import UserDiagDialog from "@/components/user/UserDiagDialog.vue";
import { useUserStore } from "@/stores/userStore";
import { useAccountStore } from "@/stores/accountStore";
import { useOrderStore } from "@/stores/orderStore";
import { useConfigStore } from "@/stores/configStore";

const emit = defineEmits<{ logout: []; viewOrders: [] }>();

const props = withDefaults(
  defineProps<{
    /** 管理端用户详情：只读嵌入，不改动当前登录会话 */
    embedded?: boolean;
    embeddedUserName?: string;
  }>(),
  { embedded: false },
);

const router = useRouter();
const user = useUserStore();
const accountStore = useAccountStore();
const orderStore = useOrderStore();
const configStore = useConfigStore();
const { displayName, apiDelay } = storeToRefs(user);
const { totalBalance } = storeToRefs(accountStore);
const { config } = storeToRefs(configStore);
const { dayProfit } = storeToRefs(orderStore);

const totalOrders = computed(() => {
  let n = 0;
  for (const rows of orderStore.orders.values()) n += rows.length;
  return n;
});

/** 对齐 A8 UserInfoView `TT`：统计数字过渡 */
const animBalance = useTransition(totalBalance, { duration: 1000 });
const animToday = useTransition(dayProfit, { duration: 1000 });
const animOrders = useTransition(totalOrders, { duration: 1000 });

const configOpen = ref(false);
const userDiagOpen = ref(false);

/** 对齐 bundle `UserInfoView` 延迟按钮 type（success / warning / danger） */
const delayButtonType = computed(() => {
  if (props.embedded) return undefined;
  const d = apiDelay.value;
  if (!d) return undefined;
  if (d < 100) return "success";
  if (d < 500) return "warning";
  return "danger";
});

const shownUserName = computed(() =>
  props.embedded ? props.embeddedUserName || displayName.value : displayName.value,
);
</script>

<template>
  <section class="userinfo">
    <div class="info flex flex-between flex-middle">
      <div class="userName">
        <el-button-group>
          <el-button
            type="primary"
            size="small"
            :disabled="embedded"
            @click="userDiagOpen = true"
          >
            {{ shownUserName }}
          </el-button>
          <el-button
            size="small"
            :type="delayButtonType"
            :disabled="embedded"
            @click="user.toggleHiddenUserName()"
          >
            {{ embedded ? "—" : apiDelay }}<span class="ms">ms</span>
          </el-button>
        </el-button-group>
      </div>
      <div class="actions flex">
        <el-button-group>
          <el-button
            v-if="!embedded"
            size="small"
            class="am-icon-plus"
            type="primary"
            title="添加账号"
            @click="accountStore.openCreateAccount()"
          />
          <el-button
            v-if="!embedded && user.isAdmin"
            size="small"
            class="am-icon-shield"
            type="warning"
            title="管理系统"
            aria-label="管理系统"
            @click="router.push({ name: 'admin' })"
          />
          <el-button
            size="small"
            class="am-icon-gear"
            :type="config.betting ? 'primary' : 'danger'"
            title="参数配置"
            @click="configOpen = true"
          />
          <el-button
            v-if="embedded"
            size="small"
            class="am-icon-list"
            type="info"
            title="查看订单"
            @click="emit('viewOrders')"
          />
          <el-button
            v-if="!embedded"
            size="small"
            class="am-icon-power-off"
            type="info"
            title="退出登录"
            @click="emit('logout')"
          />
        </el-button-group>
      </div>
    </div>

    <div class="report">
      <el-row>
        <el-col :span="8">
          <el-statistic
            title="总余额"
            :value="Math.round(animBalance)"
            :precision="0"
            class="report-number"
          />
        </el-col>
        <el-col :span="8">
          <el-statistic
            title="当日盈亏"
            :value="Math.round(animToday)"
            :precision="0"
            class="report-number"
          />
        </el-col>
        <el-col :span="8">
          <el-statistic
            title="订单数量"
            :value="Math.round(animOrders)"
            :precision="0"
            class="report-number"
          />
        </el-col>
      </el-row>
    </div>

    <UserConfigDialog :open="configOpen" :readonly="embedded" @close="configOpen = false" />
    <UserDiagDialog v-if="!embedded" :open="userDiagOpen" @close="userDiagOpen = false" />
  </section>
</template>
