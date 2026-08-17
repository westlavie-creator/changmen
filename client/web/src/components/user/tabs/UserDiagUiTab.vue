<script setup lang="ts">
import { ElMessage } from "element-plus";
import { storeToRefs } from "pinia";
import { ref } from "vue";
import type { UiTheme } from "@/types/extensionPrefs";
import { useUserStore } from "@/stores/userStore";

const user = useUserStore();
const { extensionPrefs } = storeToRefs(user);
const saving = ref(false);

const uiThemeOptions: { value: UiTheme; label: string }[] = [
  { value: "default", label: "默认深色" },
  { value: "brutal", label: "Brutal（粗边框）" },
  { value: "paper", label: "浅纸感" },
  { value: "terminal", label: "终端风" },
];

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
  <el-form label-width="150px" class="ui-tab">
    <div class="ui-tab__row">
      <el-form-item label="界面皮肤:" class="ui-tab__control ui-tab__control--theme">
        <el-radio-group v-model="extensionPrefs.uiTheme" size="large" class="theme-radios">
          <el-radio
            v-for="opt in uiThemeOptions"
            :key="opt.value"
            :value="opt.value"
            border
          >
            {{ opt.label }}
          </el-radio>
        </el-radio-group>
      </el-form-item>
    </div>

    <div class="ui-tab__row">
      <el-form-item label="BetRow 扩展 UI:" class="ui-tab__control">
        <el-switch
          v-model="extensionPrefs.betRowUi"
          inline-prompt
          active-text="开启"
          inactive-text="关闭"
          size="large"
        />
      </el-form-item>
      <p class="ui-tab__desc">
        套利连线、利润角标、赔率 flash、EV 金色标记。关闭可减轻主界面 CPU。
      </p>
    </div>

    <div class="flex flex-center">
      <el-button type="primary" class="am-icon-save" size="large" :loading="saving" @click="save">
        &nbsp;保存
      </el-button>
    </div>
  </el-form>
</template>

<style scoped>
.ui-tab__row {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 4px;
}

.ui-tab__control {
  flex: 0 0 320px;
  margin-bottom: 12px;
}

.ui-tab__control--theme {
  flex: 1 1 520px;
  max-width: 720px;
}

.theme-radios {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.theme-radios :deep(.el-radio) {
  margin-right: 0;
}

.ui-tab__desc {
  flex: 1;
  min-width: 0;
  margin: 8px 0 12px;
  padding-top: 2px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}
</style>
