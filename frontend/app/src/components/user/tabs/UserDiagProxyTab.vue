<script setup lang="ts">
import { reactive, ref } from "vue";
import { storeToRefs } from "pinia";
import { useUserStore } from "@/stores/userStore";

const user = useUserStore();
const { proxyList } = storeToRefs(user);
const saving = ref(false);
const draft = reactive({ label: "", url: "" });
const testMsg = ref<Record<number, string>>({});

function normalizeUrl(raw: string) {
  const socks = /^socks5:\/\/([\d.]+):(\d+):(\w+):(\w+)$/;
  const m1 = raw.match(socks);
  if (m1) return `socks5://${m1[3]}:${m1[4]}@${m1[1]}:${m1[2]}`;

  const pipe = /^([\d.]+)\|(\d+)\|(\w+)\|(\w+)\|/;
  const m2 = raw.match(pipe);
  if (m2) return `socks5://${m2[3]}:${m2[4]}@${m2[1]}:${m2[2]}`;

  return raw;
}

async function addProxy() {
  if (!draft.label.trim() || !draft.url.trim()) {
    window.alert("请填写标签与代理地址");
    return;
  }
  const url = normalizeUrl(draft.url.trim());
  try {
    new URL(url);
  } catch {
    window.alert("代理地址格式错误");
    return;
  }
  saving.value = true;
  try {
    const proxyId = Date.now();
    user.proxyList.push({ proxyId, label: draft.label.trim(), url });
    await user.saveProxyList();
    draft.label = "";
    draft.url = "";
    window.alert("保存成功");
  } finally {
    saving.value = false;
  }
}

async function removeProxy(proxyId: number) {
  if (!confirm("删除此代理？")) return;
  try {
    await user.deleteProxy(proxyId);
  } catch (e) {
    window.alert(e instanceof Error ? e.message : String(e));
  }
}

async function saveRow(row: { proxyId: number; label: string; url: string }) {
  row.url = normalizeUrl(row.url);
  saving.value = true;
  try {
    await user.saveProxyList();
  } finally {
    saving.value = false;
  }
}

async function testProxy(row: { proxyId: number; url: string }) {
  testMsg.value[row.proxyId] = "测试中…";
  try {
    const res = await fetch(`/IP/Address?proxy=${encodeURIComponent(row.url)}`);
    if (!res.ok) throw new Error("请求失败");
    const data = (await res.json()) as { delay?: number; ip?: string; address?: string };
    if (data.delay != null) {
      testMsg.value[row.proxyId] = `延迟:${data.delay}ms, IP:${data.ip ?? "?"}, 地址:${data.address ?? row.url}`;
      return;
    }
    testMsg.value[row.proxyId] = "代理连接失败";
  } catch {
    testMsg.value[row.proxyId] = "本地模式：代理测试需浏览器插件或 /IP/Address 支持";
  }
}
</script>

<template>
  <div class="diag-tab">
    <div v-for="row in proxyList" :key="row.proxyId" class="proxy-item">
      <div class="proxy-row">
        <span class="proxy-label">标签</span>
        <input v-model="row.label" type="text" :disabled="saving" @change="saveRow(row)" />
      </div>
      <div class="proxy-row">
        <span class="proxy-label">地址</span>
        <input v-model="row.url" type="text" :disabled="saving" @change="saveRow(row)" />
      </div>
      <div class="proxy-actions">
        <button type="button" class="mini-btn" title="测试" @click="testProxy(row)">⚡</button>
        <button
          type="button"
          class="mini-btn mini-btn--danger"
          :disabled="saving"
          @click="removeProxy(row.proxyId)"
        >
          ×
        </button>
      </div>
      <p v-if="testMsg[row.proxyId]" class="proxy-test">测试结果: {{ testMsg[row.proxyId] }}</p>
    </div>

    <fieldset class="diag-fieldset">
      <legend>添加代理配置</legend>
      <label class="form-row">
        <span>标签名</span>
        <input v-model="draft.label" type="text" placeholder="标签名称" />
      </label>
      <label class="form-row">
        <span>代理地址</span>
        <input
          v-model="draft.url"
          type="text"
          placeholder="http://username:password@host:port"
          @change="draft.url = normalizeUrl(draft.url)"
        />
      </label>
      <button
        type="button"
        class="save-btn"
        :disabled="saving || !draft.label || !draft.url"
        @click="addProxy"
      >
        保存
      </button>
    </fieldset>

    <p v-if="!proxyList.length" class="diag-tab__muted">暂无代理配置</p>
  </div>
</template>

<style scoped>
.proxy-item {
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid #1e293b;
}
.proxy-row {
  display: grid;
  grid-template-columns: 48px 1fr;
  gap: 8px;
  align-items: center;
  margin-bottom: 6px;
  font-size: 12px;
}
.proxy-label {
  color: #94a3b8;
}
.proxy-row input {
  padding: 6px 8px;
  border: 1px solid #475569;
  border-radius: 4px;
  background: #0f172a;
  color: #e2e8f0;
}
.proxy-actions {
  display: flex;
  gap: 6px;
  margin-top: 4px;
}
.diag-fieldset {
  border: 1px solid #334155;
  border-radius: 4px;
  padding: 10px 12px;
  margin-top: 12px;
}
.diag-fieldset legend {
  padding: 0 6px;
  font-size: 13px;
  color: #e2e8f0;
}
.form-row {
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 13px;
  color: #cbd5e1;
}
.form-row input {
  padding: 6px 8px;
  border: 1px solid #475569;
  border-radius: 4px;
  background: #0f172a;
  color: #e2e8f0;
}
.save-btn,
.mini-btn {
  padding: 4px 10px;
  font-size: 12px;
  border-radius: 4px;
  border: 1px solid #475569;
  background: #409eff;
  color: #fff;
  cursor: pointer;
}
.mini-btn {
  background: #334155;
}
.mini-btn--danger {
  color: #f87171;
}
.proxy-test {
  margin: 6px 0 0;
  font-size: 11px;
  color: #94a3b8;
}
.diag-tab__muted {
  color: #64748b;
  font-size: 13px;
}
</style>
