<script setup lang="ts">
import { reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { storeToRefs } from "pinia";
import { useUserStore } from "@/stores/userStore";
import { testProxyUrl } from "@/shared/proxyTest";

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

const canAdd = () => !saving.value && Boolean(draft.label.trim() && draft.url.trim());

async function addProxy() {
  if (!canAdd()) return;
  const url = normalizeUrl(draft.url.trim());
  try {
    new URL(url);
  } catch {
    ElMessage.error("代理地址格式错误");
    return;
  }
  saving.value = true;
  try {
    if (!(await testProxyUrl(url))) {
      ElMessage.error("代理连接测试失败");
      return;
    }
    const proxyId = Date.now();
    user.proxyList.push({ proxyId, label: draft.label.trim(), url });
    await user.saveProxyList();
    draft.label = "";
    draft.url = "";
    ElMessage.success("保存成功");
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
  testMsg.value[row.proxyId] = "测试中...";
  const result = await testProxyUrl(row.url);
  if (!result) {
    testMsg.value[row.proxyId] = "代理连接失败";
    return;
  }
  testMsg.value[row.proxyId] = `延迟:${result.delay}ms, IP:${result.ip ?? "?"}, 地址:${result.address ?? row.url}`;
}
</script>

<template>
  <el-form>
    <div v-for="row in proxyList" :key="row.proxyId" class="proxy-item">
      <el-row :gutter="10">
        <el-col :span="6">
          <el-input
            v-model="row.label"
            :disabled="saving"
            @change="saveRow(row)"
          >
            <template #prepend>标签</template>
          </el-input>
        </el-col>
        <el-col :span="14">
          <el-input v-model="row.url" :disabled="saving" @change="saveRow(row)">
            <template #prepend>地址</template>
          </el-input>
        </el-col>
        <el-col :span="4">
          <el-button class="am-icon-flash" @click="testProxy(row)" />
          <el-button
            type="danger"
            class="am-icon-times"
            :disabled="saving"
            @click="removeProxy(row.proxyId)"
          />
        </el-col>
        <el-col v-if="testMsg[row.proxyId]" :span="24">
          <el-form-item label="测试结果:">
            <div class="test-result">{{ testMsg[row.proxyId] }}</div>
          </el-form-item>
        </el-col>
      </el-row>
    </div>
  </el-form>

  <fieldset>
    <legend>添加代理配置</legend>
    <el-form label-width="100" :model="draft">
      <el-form-item label="标签名:">
        <el-input v-model="draft.label" placeholder="标签名称" />
      </el-form-item>
      <el-form-item label="代理地址:">
        <el-input
          v-model="draft.url"
          placeholder="http://username:password@host:port"
          @change="draft.url = normalizeUrl(draft.url)"
        />
      </el-form-item>
      <el-form-item>
        <el-button
          type="primary"
          class="am-icon-save"
          :disabled="!canAdd()"
          @click="addProxy"
        >
          &nbsp;保存
        </el-button>
      </el-form-item>
    </el-form>
  </fieldset>
</template>
