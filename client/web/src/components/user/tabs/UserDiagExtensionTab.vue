<script setup lang="ts">
import type { ArbDetectEngine } from "@/types/arbDetectEngine";
import { ElMessage } from "element-plus";
import { storeToRefs } from "pinia";
import { computed, onMounted, ref } from "vue";
import { syncArbRuntime } from "@/extensions/arbOpportunity";
import { useConfigStore } from "@/stores/configStore";
import {

  isKakaxiArbDetectSelectable,
} from "@/types/arbDetectEngine";

const configStore = useConfigStore();
const { config, saving } = storeToRefs(configStore);
/** 双击「实验」后本会话内才可选 kakaxi（不自动切换引擎） */
const kakaxiUnlocked = ref(false);

const engine = computed({
  get: () => config.value.arbDetectEngine ?? "a8",
  set: (v: ArbDetectEngine) => {
    config.value.arbDetectEngine = v;
  },
});

function unlockKakaxiEngine() {
  if (kakaxiUnlocked.value)
    return;
  kakaxiUnlocked.value = true;
}

onMounted(async () => {
  if (!configStore.loaded) {
    await configStore.load();
  }
});

async function save() {
  if (engine.value === "kakaxi") {
    if (!kakaxiUnlocked.value) {
      config.value.arbDetectEngine = "a8";
      ElMessage.warning("请先双击「实验」解锁后再选择 kakaxi");
      return;
    }
    if (!isKakaxiArbDetectSelectable()) {
      config.value.arbDetectEngine = "a8";
      ElMessage.warning("kakaxi 检测尚未开放，已保持 A8");
    }
  }
  const result = await configStore.save();
  if (result.ok) {
    syncArbRuntime();
    ElMessage.success("保存成功");
  }
  else {
    ElMessage.error(result.msg || "保存失败");
  }
}
</script>

<template>
  <el-form label-width="120px" class="user-diag-extension">
    <el-form-item label="套利检测引擎:">
      <el-radio-group v-model="engine">
        <el-radio value="a8">
          A8 检测（默认，每盘口试单）
        </el-radio>
        <el-radio value="kakaxi" :disabled="!kakaxiUnlocked">
          kakaxi 调度（<span
            title="双击解锁"
            @dblclick.stop="unlockKakaxiEngine"
          >实验</span>）
        </el-radio>
      </el-radio-group>
      <p class="hint">
        开启投注时，<strong>A8</strong> 由主循环 ~100ms 全表遍历；<strong>kakaxi</strong>
        由赔率事件入队、主循环消费队列（不全表遍历）。补单与拉列表不变。机会 Telegram 由「消息通知」页单独开关。
      </p>
    </el-form-item>

    <el-form-item label="比例 9999:">
      <p class="hint title">
        单边模式（changmen 扩展，A8 无此语义）
      </p>
    </el-form-item>
    <el-form-item>
      <ul class="hint list">
        <li>在账号「投注比例」某区间填 <strong>9999</strong>：该侧<strong>不参与</strong>自动下单。</li>
        <li>出现套利机会时，系统在对侧平台<strong>真下单</strong>（单边敞口，非假单）。</li>
        <li>LinkID 为负时间戳表示单边（展示为负数，如 <code>-1710000000123</code>）。</li>
        <li>Telegram 仍用双腿版式：9999 侧标注「本侧不下单」，对侧显示真实结果。</li>
        <li>缺腿若因余额不足、暂停等（非 9999），则整单跳过，与 A8 一致。</li>
      </ul>
    </el-form-item>

    <div class="flex flex-center">
      <el-button type="primary" class="am-icon-save" size="large" :loading="saving" @click="save">
        &nbsp;保存
      </el-button>
    </div>
  </el-form>
</template>

<style scoped>
.hint {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.6;
}
.hint.title {
  color: var(--el-text-color-primary);
  font-weight: 500;
}
.list {
  padding-left: 1.2em;
}
.list li {
  margin-bottom: 0.35em;
}
</style>
