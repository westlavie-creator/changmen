<script setup lang="ts">
import { ElMessage } from "element-plus";
import { storeToRefs } from "pinia";
import { ref } from "vue";
import { useUserStore } from "@/stores/userStore";

const user = useUserStore();
const { extensionPrefs } = storeToRefs(user);
const saving = ref(false);

async function save() {
  saving.value = true;
  try {
    await user.saveExtensionPrefs();
    ElMessage.success("保存成功");
  }
  catch (err) {
    ElMessage.error(err instanceof Error ? err.message : "保存失败");
  }
  finally {
    saving.value = false;
  }
}
</script>

<template>
  <el-form label-width="140px" class="extensions-tab">
    <p class="extensions-tab__hint">
      关闭后可减轻主界面 CPU 占用（BetRow 不再绘制套利连线、赔率涨跌动画与 EV 标记）。保存后立即生效。
    </p>
    <el-form-item label="BetRow 扩展 UI:">
      <el-switch
        v-model="extensionPrefs.betRowUi"
        inline-prompt
        active-text="开启"
        inactive-text="关闭"
        size="large"
      />
    </el-form-item>
    <el-form-item label="9999 单边预检:">
      <el-switch
        v-model="extensionPrefs.singleLeg9999Precheck"
        inline-prompt
        active-text="开启"
        inactive-text="关闭"
        size="large"
      />
    </el-form-item>
    <el-form-item>
      <ul class="extensions-tab__list">
        <li>套利腿高亮与红线连接</li>
        <li>利润百分比角标</li>
        <li>赔率涨跌 flash 与 H/M 来源角标</li>
        <li>正 EV / 近 EV 金色标记</li>
      </ul>
    </el-form-item>
    <el-form-item label="9999 预检说明:">
      <ul class="extensions-tab__list">
        <li>开启：比例 9999 本侧参与预检（按计划金额验盘口/赔率，不按 9999 倍率碰限红），失败则整笔不下；本侧仍不自动下单</li>
        <li>关闭：9999 本侧跳过预检，仅对侧自动下单（与旧行为一致）</li>
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
.extensions-tab__hint {
  margin: 0 0 16px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}

.extensions-tab__list {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  color: var(--el-text-color-regular);
  line-height: 1.6;
}
</style>
