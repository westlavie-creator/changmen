<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { getChatHistory } from "@/api/esport";
import type { ChatMessageRow } from "@/types/esport";
import { formatDate } from "@/shared/format";

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

function tagType(user: string): "success" | "danger" | "info" {
  if (!user) return "info";
  if (tags.value.some((tag) => {
    try {
      return new RegExp(tag).test(user);
    } catch {
      return false;
    }
  })) {
    return "success";
  }
  if (/\d{5,}/.test(user)) return "danger";
  return "info";
}

function addTagFromUser(user: string) {
  const digits = user.replace(/[^\d]/g, "");
  if (digits && !tags.value.includes(digits)) {
    tags.value.push(digits);
    saveTags();
  }
}

function removeTag(index: number) {
  tags.value.splice(index, 1);
  saveTags();
}

function addTagInput(raw: string) {
  const v = raw.trim();
  if (!v || tags.value.includes(v)) return;
  tags.value.push(v);
  saveTags();
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

const tagDraft = ref("");

onMounted(load);
watch(filterText, saveFilter);
</script>

<template>
  <div class="diag-tab chat-tab">
    <div class="chat-toolbar">
      <label class="chat-toolbar__item">
        <span>logId</span>
        <input v-model.number="logId" type="number" :disabled="loading" @change="applyLogId" />
      </label>
      <label class="chat-toolbar__item chat-toolbar__item--grow">
        <span>过滤</span>
        <input v-model="filterText" type="text" placeholder="正则" />
      </label>
      <div class="chat-toolbar__item chat-toolbar__item--grow">
        <span>标签</span>
        <div class="tag-editor">
          <span v-for="(tag, i) in tags" :key="tag" class="tag-chip">
            {{ tag }}
            <button type="button" class="tag-chip__x" @click="removeTag(i)">×</button>
          </span>
          <input
            v-model="tagDraft"
            type="text"
            class="tag-draft"
            placeholder="回车添加"
            @keydown.enter.prevent="
              addTagInput(tagDraft);
              tagDraft = '';
            "
          />
        </div>
      </div>
      <button type="button" class="mini-btn" :disabled="loading" @click="load">刷新</button>
    </div>

    <p v-if="loading" class="diag-tab__muted">加载中…</p>
    <div v-else-if="grouped.size" class="chat-groups">
      <div v-for="[user, msgs] in grouped" :key="user" class="chat-group">
        <span class="chat-time">{{ formatDate(Number(msgs[0]?.Time ?? msgs[0]?.CreateAt ?? 0)).slice(-8) }}</span>
        <button
          type="button"
          class="chat-user"
          :class="`chat-user--${tagType(user)}`"
          @dblclick="addTagFromUser(user)"
        >
          {{ user }}
        </button>
        <span v-for="msg in msgs" :key="msg.ID ?? msg.Id" class="chat-content">
          {{ msg.Content ?? msg.content }}
        </span>
      </div>
    </div>
    <p v-else class="diag-tab__muted">
      {{ rows.length === 0 ? "暂无更新内容" : "无有效信息" }}
    </p>

    <div class="chat-footer">
      <button type="button" class="mini-btn" :disabled="loading" @click="load">刷新</button>
    </div>
  </div>
</template>

<style scoped>
.chat-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: flex-end;
  margin-bottom: 10px;
}
.chat-toolbar__item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  color: #94a3b8;
}
.chat-toolbar__item--grow {
  flex: 1;
  min-width: 120px;
}
.chat-toolbar input {
  padding: 4px 6px;
  border: 1px solid #475569;
  border-radius: 4px;
  background: #0f172a;
  color: #e2e8f0;
  font-size: 12px;
}
.tag-editor {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  min-height: 28px;
  padding: 4px;
  border: 1px solid #475569;
  border-radius: 4px;
  background: #0f172a;
}
.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 1px 6px;
  border-radius: 999px;
  background: #334155;
  font-size: 11px;
  color: #e2e8f0;
}
.tag-chip__x {
  border: none;
  background: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 0 2px;
}
.tag-draft {
  border: none !important;
  background: transparent !important;
  flex: 1;
  min-width: 60px;
}
.mini-btn {
  padding: 4px 10px;
  font-size: 12px;
  border: 1px solid #475569;
  border-radius: 4px;
  background: #059669;
  color: #fff;
  cursor: pointer;
}
.chat-groups {
  max-height: 48vh;
  overflow: auto;
}
.chat-group {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  padding: 6px 0;
  border-bottom: 1px solid #1e293b;
  font-size: 13px;
}
.chat-time {
  font-size: 11px;
  color: #64748b;
  padding: 2px 6px;
  background: #334155;
  border-radius: 4px;
}
.chat-user {
  border: none;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 12px;
  cursor: pointer;
}
.chat-user--info {
  background: #409eff;
  color: #fff;
}
.chat-user--success {
  background: #059669;
  color: #fff;
}
.chat-user--danger {
  background: #dc2626;
  color: #fff;
}
.chat-content {
  color: #cbd5e1;
}
.chat-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}
.diag-tab__muted {
  color: #64748b;
  font-size: 13px;
}
</style>
