<script setup lang="ts">
import { computed } from "vue";

defineProps<{
  userName: string;
  totalBalance: number;
  totalToday: number;
  totalOrders: number;
  betting: boolean;
}>();

const emit = defineEmits<{ openConfig: []; viewOrders: [] }>();

const delayButtonType = computed(() => undefined);
</script>

<template>
  <section class="userinfo">
    <div class="info flex flex-between flex-middle">
      <div class="userName">
        <el-button-group>
          <el-button type="primary" size="small" disabled>
            {{ userName }}
          </el-button>
          <el-button size="small" :type="delayButtonType" disabled>
            —<span class="ms">ms</span>
          </el-button>
        </el-button-group>
      </div>
      <div class="actions flex">
        <el-button-group>
          <el-button size="small" class="am-icon-plus" type="primary" title="添加账号" disabled />
          <el-button
            size="small"
            class="am-icon-gear"
            :type="betting ? 'primary' : 'danger'"
            title="参数配置"
            @click="emit('openConfig')"
          />
          <el-button
            size="small"
            class="am-icon-list"
            type="info"
            title="查看订单"
            @click="emit('viewOrders')"
          />
        </el-button-group>
      </div>
    </div>

    <div class="report">
      <el-row>
        <el-col :span="8">
          <el-statistic
            title="总余额"
            :value="Math.round(totalBalance)"
            :precision="0"
            class="report-number"
          />
        </el-col>
        <el-col :span="8">
          <el-statistic
            title="当日盈亏"
            :value="Math.round(totalToday)"
            :precision="0"
            class="report-number"
          />
        </el-col>
        <el-col :span="8">
          <el-statistic
            title="订单数量"
            :value="Math.round(totalOrders)"
            :precision="0"
            class="report-number"
          />
        </el-col>
      </el-row>
    </div>
  </section>
</template>
