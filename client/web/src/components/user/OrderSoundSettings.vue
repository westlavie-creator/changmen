<script setup lang="ts">
import type { OrderSoundPlayMode, OrderSoundPrefs, OrderSoundPresetId } from "@/shared/orderSound";
import { useOrderSoundPlayer } from "@/composables/useOrderSoundPlayer";
import { ElMessage } from "element-plus";
import { onMounted, reactive, ref, watch } from "vue";
import {
  ORDER_SOUND_PLAY_MODE_LABELS,
  ORDER_SOUND_PRESET_LABELS,
  clearOrderSoundCustomCache,
  currentOrderSoundUserName,
  deleteCustomOrderSound,
  ensureCustomOrderSoundMigrated,
  isAudioFile,
  isFileSystemAccessSupported,
  loadOrderSoundPrefs,
  pickCustomSoundViaFileSystemAccess,
  saveCustomOrderSoundBlob,
  saveOrderSoundPrefs,
  stopOrderSound,
} from "@/shared/orderSound";

const props = defineProps<{
  readonly?: boolean;
}>();

const prefs = reactive<OrderSoundPrefs>(loadOrderSoundPrefs());
const fileInputRef = ref<HTMLInputElement | null>(null);
const picking = ref(false);
const needsReselect = ref(false);
const { playing, preview } = useOrderSoundPlayer();

const presetOptions: { value: OrderSoundPresetId; label: string }[] = [
  ...Object.entries(ORDER_SOUND_PRESET_LABELS).map(([value, label]) => ({
    value: value as OrderSoundPresetId,
    label,
  })),
  { value: "custom", label: "自定义文件" },
];

const playModeOptions = Object.entries(ORDER_SOUND_PLAY_MODE_LABELS).map(([value, label]) => ({
  value: value as OrderSoundPlayMode,
  label,
}));

function persist() {
  if (props.readonly)
    return;
  saveOrderSoundPrefs(prefs);
}

watch(prefs, persist, { deep: true });

watch(() => prefs.enabled, (enabled) => {
  if (!enabled)
    void stopOrderSound();
});

async function refreshNeedsReselect() {
  if (prefs.presetId !== "custom" || !prefs.customFileName) {
    needsReselect.value = false;
    return;
  }
  const ok = await ensureCustomOrderSoundMigrated(currentOrderSoundUserName(), {
    allowPermissionPrompt: false,
  });
  Object.assign(prefs, loadOrderSoundPrefs());
  needsReselect.value = !ok;
}

watch(() => prefs.presetId, () => {
  void refreshNeedsReselect();
});

onMounted(() => {
  Object.assign(prefs, loadOrderSoundPrefs());
  void refreshNeedsReselect();
});

async function applyCustomFile(file: File) {
  const userName = currentOrderSoundUserName();
  await deleteCustomOrderSound(userName);
  clearOrderSoundCustomCache(userName);
  await saveCustomOrderSoundBlob(userName, file);
  prefs.customFileName = file.name;
  prefs.customSource = "blob";
  prefs.presetId = "custom";
  prefs.enabled = true;
  needsReselect.value = false;
  persist();
}

async function onPickFile() {
  if (props.readonly)
    return;
  picking.value = true;
  try {
    // 支持 FS Access 时只用系统选择器；取消不应再弹出 <input type=file>
    if (isFileSystemAccessSupported()) {
      const picked = await pickCustomSoundViaFileSystemAccess();
      if (picked) {
        await applyCustomFile(picked.file);
        ElMessage.success(`已选择 ${picked.file.name}`);
      }
      return;
    }
    fileInputRef.value?.click();
  }
  catch (e) {
    ElMessage.error(e instanceof Error ? e.message : "选择文件失败");
  }
  finally {
    picking.value = false;
  }
}

async function onFileInputChange(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file)
    return;
  if (!isAudioFile(file)) {
    ElMessage.warning("请选择音频文件（mp3 / wav / ogg 等）");
    return;
  }
  try {
    await applyCustomFile(file);
    ElMessage.success(`已选择 ${file.name}`);
  }
  catch (e) {
    ElMessage.error(e instanceof Error ? e.message : "保存失败");
  }
}

async function clearCustomFile() {
  if (props.readonly)
    return;
  try {
    const userName = currentOrderSoundUserName();
    await deleteCustomOrderSound(userName);
    clearOrderSoundCustomCache(userName);
    prefs.customFileName = undefined;
    prefs.customSource = undefined;
    needsReselect.value = false;
    if (prefs.presetId === "custom")
      prefs.presetId = "chime";
    persist();
    ElMessage.success("已清除自定义音频");
  }
  catch (e) {
    ElMessage.error(e instanceof Error ? e.message : "清除失败");
  }
}

async function onPreview() {
  if (props.readonly)
    return;
  persist();
  try {
    await preview();
    Object.assign(prefs, loadOrderSoundPrefs());
    await refreshNeedsReselect();
  }
  catch {
    if (!playing.value) {
      await refreshNeedsReselect();
      ElMessage.warning(
        prefs.presetId === "custom"
          ? "无法播放，请重新选择音频文件，或检查浏览器是否静音"
          : "无法播放，请检查浏览器是否静音",
      );
    }
  }
}
</script>

<template>
  <div class="order-sound-settings config-section">
    <div class="config-section__title">
      下单提示音
      <span class="order-sound-settings__hint">仅保存在本浏览器，不上传服务器</span>
    </div>

    <el-form-item label="启用:" label-width="120px">
      <el-switch
        v-model="prefs.enabled"
        inline-prompt
        active-text="开"
        inactive-text="关"
        :disabled="readonly"
      />
    </el-form-item>

    <el-form-item label="音效:" label-width="120px">
      <el-select
        v-model="prefs.presetId"
        style="width: 200px"
        :disabled="readonly"
      >
        <el-option
          v-for="opt in presetOptions"
          :key="opt.value"
          :label="opt.label"
          :value="opt.value"
        />
      </el-select>
      <el-button
        class="order-sound-settings__preview"
        :type="playing ? 'danger' : 'default'"
        :disabled="readonly"
        @click="onPreview"
      >
        {{ playing ? "停止" : "试听" }}
      </el-button>
    </el-form-item>

    <el-form-item v-if="prefs.presetId === 'custom'" label="音频文件:" label-width="120px">
      <input
        ref="fileInputRef"
        type="file"
        accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac"
        class="order-sound-settings__file-input"
        :disabled="readonly"
        @change="onFileInputChange"
      >
      <el-button :disabled="readonly" :loading="picking" @click="onPickFile">
        选择文件
      </el-button>
      <span v-if="prefs.customFileName" class="order-sound-settings__file-name">
        {{ prefs.customFileName }}
      </span>
      <el-button
        v-if="prefs.customFileName"
        link
        type="danger"
        :disabled="readonly"
        @click="clearCustomFile"
      >
        清除
      </el-button>
      <p v-if="needsReselect" class="order-sound-settings__file-warn">
        旧版文件句柄已失效，请重新选择音频文件（将保存到本机浏览器）。
      </p>
      <p class="order-sound-settings__file-hint">
        文件副本保存在本机浏览器（IndexedDB），刷新后仍可播放，无需重复授权。
      </p>
    </el-form-item>

    <el-form-item label="音量:" label-width="120px">
      <el-slider
        v-model="prefs.volume"
        :min="0"
        :max="1"
        :step="0.05"
        show-input
        :disabled="readonly"
        style="max-width: 320px"
      />
    </el-form-item>

    <el-form-item label="触发:" label-width="120px">
      <el-radio-group v-model="prefs.playMode" :disabled="readonly">
        <el-radio
          v-for="opt in playModeOptions"
          :key="opt.value"
          :value="opt.value"
        >
          {{ opt.label }}
        </el-radio>
      </el-radio-group>
    </el-form-item>
  </div>
</template>

<style scoped>
.order-sound-settings {
  margin-top: 12px;
}

.order-sound-settings__hint {
  margin-left: 8px;
  font-size: 11px;
  font-weight: normal;
  color: var(--el-text-color-secondary);
}

.order-sound-settings__preview {
  margin-left: 8px;
}

.order-sound-settings__file-input {
  display: none;
}

.order-sound-settings__file-name {
  margin-left: 10px;
  font-size: 12px;
  color: var(--el-text-color-regular);
  word-break: break-all;
}

.order-sound-settings__file-hint {
  margin: 6px 0 0;
  max-width: 520px;
  font-size: 11px;
  line-height: 1.45;
  color: var(--el-text-color-secondary);
}

.order-sound-settings__file-warn {
  margin: 6px 0 0;
  max-width: 520px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--el-color-warning);
}

.order-sound-settings :deep(.el-form-item) {
  margin-bottom: 10px;
}
</style>
