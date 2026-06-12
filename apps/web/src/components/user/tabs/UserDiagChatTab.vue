<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { getChatHistory } from "@/api/esport";
import type { ChatMessageRow } from "@/types/esport";
import { formatTimeHms } from "@/shared/format";

const CHAT_LOG_ID_KEY = "CHAT_MESSAGE_LOGID";
const CHAT_FILTER_KEY = "CHAT_MESSAGE_FILTER";
const CHAT_TAGS_KEY = "CHAT_MESSAGE_TAGS";

const loading = ref(false);
const rows = ref<ChatMessageRow[]>([]);
const logId = ref<number>(Number(localStorage.getItem(CHAT_LOG_ID_KEY) || 0) || 0);
const filterText = ref(localStorage.getItem(CHAT_FILTER_KEY) ?? "");
const tags = ref<string[]>(JSON.parse(localStorage.getItem(CHAT_TAGS_KEY) ?? "[]"));

const grouped = computed(() => {
  let pattern: RegExp | undefined;
  if (filterText.value.trim()) {
    try {
      pattern = new RegExp(filterText.value);
    } catch {
      pattern = undefined;
    }
  }
  const map = new Map<string, ChatMessageRow[]>();
  for (const row of rows.value) {
    const user = row.User ?? row.UserName ?? row.userName ?? "?";
    if (pattern && !pattern.test(user)) continue;
    const list = map.get(user) ?? [];
    list.push(row);
    map.set(user, list);
  }
  return map;
});

function saveFilter() {
  try {
    if (filterText.value) new RegExp(filterText.value);
  } catch {
    filterText.value = "";
  }
  localStorage.setItem(CHAT_FILTER_KEY, filterText.value);
}

function saveTags() {
  localStorage.setItem(CHAT_TAGS_KEY, JSON.stringify(tags.value));
}

function tagType(user: string): "success" | "danger" | "primary" {
  if (!user) return "primary";
  if (
    tags.value.some((tag) => {
      try {
        return new RegExp(tag).test(user);
      } catch {
        return false;
      }
    })
  ) {
    return "success";
  }
  if (/\d{5,}/.test(user)) return "danger";
  return "primary";
}

function addTagFromUser(user: string) {
  const digits = user.replace(/[^\d]/g, "");
  if (digits && !tags.value.includes(digits)) {
    tags.value.push(digits);
    saveTags();
  }
}

async function load() {
  loading.value = true;
  rows.value = [];
  try {
    const body = logId.value ? { logId: logId.value } : {};
    const list = await getChatHistory(body);
    rows.value = list ?? [];
    if (rows.value.length) {
      const maxId = Math.max(...rows.value.map((r) => Number(r.ID ?? r.Id ?? 0)));
      if (maxId > 0) {
        localStorage.setItem(CHAT_LOG_ID_KEY, String(maxId));
      }
    }
  } finally {
    loading.value = false;
  }
}

async function applyLogId() {
  localStorage.setItem(CHAT_LOG_ID_KEY, String(logId.value || 0));
  await load();
}

onMounted(load);
watch(filterText, saveFilter);
</script>

<template>
  <div class="flex flex-between top">
    <div class="log">
      <el-input
        v-model.number="logId"
        type="number"
        :disabled="loading"
        @change="applyLogId"
      />
    </div>
    <div class="filter">
      <el-input v-model="filterText" @change="saveFilter" />
    </div>
    <div class="tags flex-1">
      <el-input-tag v-model="tags" @change="saveTags" />
    </div>
    <el-button :disabled="loading" @click="load">刷新</el-button>
  </div>

  <el-row>
    <el-col
      v-for="[user, msgs] in grouped"
      :key="user"
      :span="24"
      :gutter="10"
      class="message"
    >
      <el-tag type="info">
        {{ formatTimeHms(Number(msgs[0]?.Time ?? msgs[0]?.CreateAt ?? 0)) }}
      </el-tag>
      <el-tag :type="tagType(user)" @dblclick="addTagFromUser(user)">
        {{ user }}
      </el-tag>
      <span v-for="msg in msgs" :key="msg.ID ?? msg.Id" class="content">
        {{ msg.Content ?? msg.content }}
      </span>
    </el-col>
  </el-row>

  <el-empty
    v-if="!grouped.size"
    :description="rows.length === 0 ? '暂无更新内容' : '无有效信息'"
  />

  <div class="flex flex-right">
    <el-button :disabled="loading" @click="load">刷新</el-button>
  </div>
</template>
