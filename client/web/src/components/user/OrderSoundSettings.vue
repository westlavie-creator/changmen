<script setup lang="ts">
import type { OrderSoundPlayMode, OrderSoundPrefs, OrderSoundPresetId } from "@/shared/orderSound";
import { ElMessage } from "element-plus";
import { onMounted, reactive, ref, watch } from "vue";
import {
  ORDER_SOUND_PLAY_MODE_LABELS,
  ORDER_SOUND_PRESET_LABELS,
  currentOrderSoundUserName,
  deleteCustomOrderSound,
  isAudioFile,
  loadOrderSoundPrefs,
  pickCustomSoundViaFileSystemAccess,
  previewOrderSound,
  saveCustomOrderSoundBlob,
  saveCustomOrderSoundHandle,
  saveOrderSoundPrefs,
} from "@/shared/orderSound";

const props = defineProps<{
  readonly?: boolean;
}>();

const prefs = reactive<OrderSoundPrefs>(loadOrderSoundPrefs());
const fileInputRef = ref<HTMLInputElement | null>(null);
const picking = ref(false);

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

onMounted(() => {
  Object.assign(prefs, loadOrderSoundPrefs());
});

async function applyCustomFile(file: File, source: "blob" | "handle", handle?: FileSystemFileHandle) {
  const userName = currentOrderSoundUserName();
  await deleteCustomOrderSound(userName);
  if (source === "handle" && handle)
    await saveCustomOrderSoundHandle(userName, handle);
  else
    await saveCustomOrderSoundBlob(userName, file);
  prefs.customFileName = file.name;
  prefs.customSource = source;
  prefs.presetId = "custom";
  prefs.enabled = true;
  persist();
}

async function onPickFile() {
  if (props.readonly)
    return;
  picking.value = true;
  try {
    const picked = await pickCustomSoundViaFileSystemAccess();
    if (picked) {
      await applyCustomFile(picked.file, "handle", picked.handle);
      ElMessage.success(`已选择 ${picked.file.name}`);
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
    await applyCustomFile(file, "blob");
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
    await deleteCustomOrderSound(currentOrderSoundUserName());
    prefs.customFileName = undefined;
    prefs.customSource = undefined;
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
    await previewOrderSound();
  }
  catch {
    ElMessage.warning("无法播放，请先选择文件并点击试听，或检查浏览器是否静音");
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
        :disabled="readonly"
        @click="onPreview"
      >
        试听
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
      <p class="order-sound-settings__file-hint">
        文件保存在本机浏览器（IndexedDB），无大小限制；Chrome / Edge 会记住文件句柄，刷新后仍可播放。
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

.order-sound-settings :deep(.el-form-item) {
  margin-bottom: 10px;
}
</style>
