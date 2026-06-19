<script setup lang="ts">
import type { AdminUserRow } from "@/types/admin";
import UserWorkspacePreview from "@/components/admin/preview/UserWorkspacePreview.vue";

defineProps<{
  user: AdminUserRow;
}>();

const emit = defineEmits<{ viewOrders: [] }>();
</script>

<template>
  <UserWorkspacePreview :user="user" @view-orders="emit('viewOrders')" />
</template>
