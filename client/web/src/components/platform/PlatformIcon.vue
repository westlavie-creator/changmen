<script setup lang="ts">
import type { PlatformId } from "@changmen/api-contract";

defineProps<{
  /** 平台 ID，对应 manifest.json id 与 .provider-icon.{id} */
  platform: PlatformId | string;
  /** OB 限红账号角标描边 */
  limit?: boolean;
}>();
</script>

<template>
  <span
    class="provider-icon"
    :class="[platform, { limit }]"
    aria-hidden="true"
  />
</template>
