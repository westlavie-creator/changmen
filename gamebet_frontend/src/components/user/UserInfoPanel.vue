<script setup lang="ts">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import { useTransition } from "@vueuse/core";
import UserConfigDialog from "@/components/user/UserConfigDialog.vue";
import UserDiagDialog from "@/components/user/UserDiagDialog.vue";
import { useUserStore } from "@/stores/userStore";
import { useAccountStore } from "@/stores/accountStore";
import { useConfigStore } from "@/stores/configStore";

const emit = defineEmits<{ logout: [] }>();

const user = useUserStore();
const accountStore = useAccountStore();
const configStore = useConfigStore();
const { displayName, apiDelay } = storeToRefs(user);
const { totalBalance, totalToday, totalOrders } = storeToRefs(accountStore);
const { config } = storeToRefs(configStore);

/** 对齐 A8 UserInfoView `TT`：统计数字过渡 */
const animBalance = useTransition(totalBalance, { duration: 1000 });
const animToday = useTransition(totalToday, { duration: 1000 });
const animOrders = useTransition(totalOrders, { duration: 1000 });

const configOpen = ref(false);
const userDiagOpen = ref(false);

/** 对齐 bundle `UserInfoView` 延迟按钮 type（success / warning / danger） */
const delayButtonType = computed(() => {
  const d = apiDelay.value;
  if (!d) return undefined;
  if (d < 100) return "success";
  if (d < 500) return "warning";
  return "danger";
});
</script>

<template>
  <section class="userinfo">
    <div class="info flex flex-between flex-middle">
      <div class="userName">
        <el-button-group>
          <el-button type="primary" size="small" @click="userDiagOpen = true">
            {{ displayName }}
          </el-button>
          <el-button size="small" :type="delayButtonType" @click="user.toggleHiddenUserName()">
            {{ apiDelay }}<span class="ms">ms</span>
          </el-button>
        </el-button-group>
      </div>
      <div class="actions flex">
        <el-button-group>
          <el-button
            size="small"
            class="am-icon-plus"
            type="primary"
            title="添加账号"
            @click="accountStore.openCreateAccount()"
          />
          <el-button
            size="small"
            class="am-icon-gear"
            :type="config.betting ? 'primary' : 'danger'"
            title="参数配置"
            @click="configOpen = true"
          />
          <el-button
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

    <UserConfigDialog :open="configOpen" @close="configOpen = false" />
    <UserDiagDialog :open="userDiagOpen" @close="userDiagOpen = false" />
  </section>
</template>
