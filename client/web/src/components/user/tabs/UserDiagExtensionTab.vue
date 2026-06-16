<script setup lang="ts">
import { enhancementModeEnabled } from "@/shared/a8Strict";
</script>

<template>
  <el-form label-width="120px" class="user-diag-extension">
    <el-form-item label="增强模式:">
      <el-switch
        v-model="enhancementModeEnabled"
        size="large"
        inline-prompt
        active-text="开启"
        inactive-text="关闭"
      />
    </el-form-item>
    <el-form-item>
      <p class="hint">
        默认开启。关闭后与 A8 原版一致（不含赔率红线、Telegram 全盘口扫描、比例 9999 单边投注等 changmen 扩展）。
      </p>
    </el-form-item>
  </el-form>
</template>

<style scoped>
.hint {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.5;
}
</style>
