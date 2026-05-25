<script setup lang="ts">
import { onMounted, reactive } from "vue";
import { storeToRefs } from "pinia";
import { getUsers } from "@/api/esport";
import { useUserStore } from "@/stores/userStore";
import { useConfigStore } from "@/stores/configStore";
import type { FollowConfig } from "@/types/order";

const user = useUserStore();
const configStore = useConfigStore();
const { follow } = storeToRefs(user);

const form = reactive<FollowConfig>({
  isOpen: false,
  betMoney: 100,
  minMoney: 0,
  maxMoney: 0,
  odds: 0,
  users: [],
});

const publishers = reactive<{ id: number; name: string }[]>([]);
const saving = reactive({ value: false });

onMounted(async () => {
  await user.loadExtras();
  if (follow.value) {
    Object.assign(form, follow.value);
    form.users = [...(follow.value.users ?? follow.value.publishers ?? [])];
  } else {
    form.betMoney = configStore.config.betMoney;
  }
  try {
    const users = await getUsers();
    publishers.splice(
      0,
      publishers.length,
      ...(users ?? [])
        .filter((u) => Boolean(u.Setting?.Publisher))
        .map((u) => ({
          id: Number(u.Id ?? u.UserID ?? 0),
          name: u.UserName ?? String(u.Id ?? ""),
        })),
    );
  } catch {
    /* ignore */
  }
});

function togglePublisher(id: number) {
  const list = form.users ?? [];
  const idx = list.indexOf(id);
  if (idx >= 0) list.splice(idx, 1);
  else list.push(id);
  form.users = [...list];
}

function isPublisherChecked(id: number) {
  return (form.users ?? []).includes(id);
}

async function save() {
  saving.value = true;
  try {
    const payload: FollowConfig = {
      ...form,
      users: [...(form.users ?? [])],
      publishers: [...(form.users ?? [])],
    };
    await user.saveFollowConfig(payload);
    window.alert("跟单配置已保存");
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="follow-tab">
    <label class="follow-switch">
      <input v-model="form.isOpen" type="checkbox" />
      <span>跟单开关</span>
    </label>

    <div class="follow-grid">
      <label>
        <span>跟单金额</span>
        <input v-model.number="form.betMoney" type="number" min="0" step="1" />
      </label>
      <label class="follow-range">
        <span>有效金额</span>
        <div class="follow-range__inputs">
          <input v-model.number="form.minMoney" type="number" min="0" step="1" />
          <span>-</span>
          <input v-model.number="form.maxMoney" type="number" min="0" step="1" />
        </div>
      </label>
      <label>
        <span>跟单赔率</span>
        <input v-model.number="form.odds" type="number" min="0" step="0.01" />
      </label>
    </div>

    <fieldset v-if="publishers.length" class="publishers">
      <legend>跟单对象</legend>
      <label v-for="p in publishers" :key="p.id" class="pub-check">
        <input
          type="checkbox"
          :checked="isPublisherChecked(p.id)"
          @change="togglePublisher(p.id)"
        />
        {{ p.name }}
      </label>
    </fieldset>
    <p v-else class="diag-tab__muted">暂无 Publisher 用户可选</p>

    <button type="button" class="btn btn--primary" :disabled="saving.value" @click="save">
      {{ saving.value ? "保存中…" : "保存配置" }}
    </button>
  </div>
</template>

<style scoped>
.follow-tab {
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-size: 13px;
}
.follow-switch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.follow-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.follow-grid label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #94a3b8;
}
.follow-range {
  grid-column: span 2;
}
.follow-range__inputs {
  display: flex;
  align-items: center;
  gap: 8px;
}
.follow-grid input {
  padding: 6px 8px;
  border: 1px solid #475569;
  border-radius: 4px;
  background: #0f172a;
  color: #e2e8f0;
}
.publishers {
  border: 1px solid #475569;
  border-radius: 6px;
  padding: 8px 10px;
  margin: 0;
}
.publishers legend {
  font-size: 12px;
  color: #94a3b8;
  padding: 0 4px;
}
.pub-check {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-right: 12px;
  margin-bottom: 6px;
  cursor: pointer;
}
.btn {
  align-self: flex-start;
  padding: 6px 14px;
  border-radius: 4px;
  border: 1px solid #409eff;
  background: #409eff;
  color: #fff;
  cursor: pointer;
  font-size: 13px;
}
.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.diag-tab__muted {
  color: #64748b;
  font-size: 12px;
}
</style>
