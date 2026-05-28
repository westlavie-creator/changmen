<script setup lang="ts">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import type { PlatformId } from "@/types/esport";
import { ALL_PLATFORMS } from "@/types/userConfig";
import { useCollectStore } from "@/stores/collectStore";
import { CREDIT_PLATE_ENTRIES, enterCreditPlate } from "@/api/v4";
import { syncCollectorsFromConfig } from "@/collectors";

const collect = useCollectStore();
const { log } = storeToRefs(collect);

/** 对齐 A8 `UserCollectView`：默认锁定，双击「盘」解锁 */
const switchesDisabled = ref(true);

const platformRows = computed(() =>
  ALL_PLATFORMS.map((id) => [id, collect.isEnabled(id)] as [PlatformId, boolean]),
);

function toggleSwitchesLock() {
  switchesDisabled.value = !switchesDisabled.value;
}

async function toggleLog() {
  if (switchesDisabled.value) return;
  await collect.saveConfig({ log: !log.value });
}

async function togglePlatform(platform: PlatformId, on: boolean) {
  if (switchesDisabled.value) return;
  const next = new Map(collect.collect);
  next.set(platform, on);
  await collect.saveConfig({ collect: next });
  syncCollectorsFromConfig();
}

async function openCredit(platform: PlatformId) {
  await enterCreditPlate(platform);
}
</script>

<template>
  <el-row class="providers" :gutter="8">
    <el-col :span="4">
      <el-switch
        :disabled="switchesDisabled"
        size="large"
        inline-prompt
        active-text="采集日志"
        inactive-text="采集日志"
        :model-value="log"
        @change="toggleLog"
      />
    </el-col>
    <el-col v-for="[id, on] in platformRows" :key="id" :span="4" class="provider">
      <el-switch
        :disabled="switchesDisabled"
        size="large"
        inline-prompt
        :active-text="id"
        :inactive-text="id"
        :model-value="on"
        @change="(v: boolean) => togglePlatform(id, v)"
      />
    </el-col>
  </el-row>

  <el-divider>
    信用<span @dblclick="toggleSwitchesLock">盘</span>入口
  </el-divider>

  <el-row class="credit" :gutter="8">
    <el-col v-for="entry in CREDIT_PLATE_ENTRIES" :key="entry.id" :span="6" class="flex-center">
      <el-button type="primary" @click="openCredit(entry.id)">
        <div class="flex flex-middle">
          <div class="provider-icon" :class="entry.id" />
          <div class="name">{{ entry.label }}</div>
        </div>
      </el-button>
    </el-col>
  </el-row>
</template>
