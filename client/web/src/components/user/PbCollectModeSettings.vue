<script setup lang="ts">
/**
 * [changmen 扩展] PB 采集模式：关 = 对齐 A8（仅滚球写 fo）。
 * 挂在「赛事采集」而非「扩展」——这是采集调度，不是 9999 类投注附加项。
 * 立即写 localStorage；总开关变化会重启 PB 采集器。不受上方「盘」锁定。
 */
import { computed } from "vue";
import { useUserStore } from "@/stores/userStore";

const user = useUserStore();

const pbChangmenExtensions = computed({
  get: () => user.pbChangmenExtensions === true,
  set: (on: boolean) => {
    void user.setPbChangmenExtensions(on);
  },
});

const pbWsShadowUi = computed({
  get: () => user.pbWsShadowUi === true,
  set: (on: boolean) => {
    void user.setPbWsShadowUi(on);
  },
});
</script>

<template>
  <section class="pb-collect-mode" aria-label="PB 采集模式">
    <el-divider>PB 采集</el-divider>
    <el-form label-position="left" label-width="158px" class="pb-collect-mode__form">
      <el-form-item>
        <template #label>
          <el-tooltip
            placement="top"
            :show-after="200"
            popper-class="pb-collect-mode-tip"
            content="默认关 = 对齐 A8（仅滚球 euro/odds 写主价 fo，不采赛前）。开 = changmen（live+prematch 双循环、赛前也写 fo、RotNum）。仅本机 localStorage；切换后立即重启 PB 采集器。不受上方「盘」锁定。"
          >
            <span class="pb-collect-mode__tip-label">PB changmen 扩展</span>
          </el-tooltip>
        </template>
        <el-switch
          v-model="pbChangmenExtensions"
          inline-prompt
          active-text="开"
          inactive-text="关"
        />
      </el-form-item>

      <el-form-item v-if="pbChangmenExtensions">
        <template #label>
          <el-tooltip
            placement="top"
            :show-after="200"
            popper-class="pb-collect-mode-tip"
            content="开总开关后默认开。主价不变。影子=官网 WS + SPA euro/odds。可单独关掉。需扩展 1.3.31+ 并重载 part888。"
          >
            <span class="pb-collect-mode__tip-label">PB WS 影子价</span>
          </el-tooltip>
        </template>
        <el-switch
          v-model="pbWsShadowUi"
          inline-prompt
          active-text="开"
          inactive-text="关"
        />
      </el-form-item>

      <el-form-item v-else>
        <template #label>
          <span class="pb-collect-mode__tip-label pb-collect-mode__tip-label--muted">PB WS 影子价</span>
        </template>
        <span class="pb-collect-mode__hint">需先开 PB changmen 扩展</span>
      </el-form-item>
    </el-form>
  </section>
</template>

<style scoped>
.pb-collect-mode__form {
  margin: 0;
  max-width: 480px;
}

.pb-collect-mode__form :deep(.el-form-item) {
  margin-bottom: 10px;
}

.pb-collect-mode__form :deep(.el-form-item__label) {
  justify-content: flex-start;
  line-height: 32px;
  height: auto;
  padding-right: 12px;
  color: var(--el-text-color-regular);
}

.pb-collect-mode__tip-label {
  display: inline-block;
  max-width: 100%;
  cursor: help;
  border-bottom: 1px dashed var(--el-border-color);
  line-height: 1.3;
}

.pb-collect-mode__tip-label--muted {
  cursor: default;
  border-bottom: none;
  color: var(--el-text-color-secondary);
}

.pb-collect-mode__hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 32px;
}
</style>

<style>
.pb-collect-mode-tip {
  max-width: 360px;
  line-height: 1.5;
  white-space: normal;
}
</style>
