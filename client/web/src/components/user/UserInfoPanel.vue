<script setup lang="ts">
import { useTransition } from "@vueuse/core";
import { storeToRefs } from "pinia";
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import UserConfigDialog from "@/components/user/UserConfigDialog.vue";
import UserDiagDialog from "@/components/user/UserDiagDialog.vue";
import { delay as esportDelay } from "@/api/apiDelay";
import { useAccountStore } from "@/stores/accountStore";
import { useOrderStore } from "@/stores/orderStore";
import { useUserStore } from "@/stores/userStore";

const props = withDefaults(
  defineProps<{
    /** 管理端用户详情：只读嵌入，不改动当前登录会话 */
    embedded?: boolean;
    embeddedUserName?: string;
  }>(),
  { embedded: false },
);

const emit = defineEmits<{ logout: []; viewOrders: [] }>();

const router = useRouter();
const user = useUserStore();
const accountStore = useAccountStore();
const orderStore = useOrderStore();
const { displayName, config } = storeToRefs(user);
const { totalBalance } = storeToRefs(accountStore);
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

/** [A8 可证实] UserInfoView：`Ut.delay.value??0` */
const shownDelay = computed(() => esportDelay.value ?? 0);

/** [A8 可证实] UserInfoView 延迟按钮 type（success / warning / danger） */
const delayButtonType = computed(() => {
  if (props.embedded)
    return undefined;
  if (!esportDelay.value)
    return undefined;
  if (esportDelay.value < 100)
    return "success";
  if (esportDelay.value < 500)
    return "warning";
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
            {{ embedded ? "—" : shownDelay }}<span class="ms">ms</span>
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
            v-if="!embedded && user.canAccessAdmin"
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
