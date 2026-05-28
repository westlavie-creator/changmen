<script setup lang="ts">
import { reactive, watch } from "vue";
import { storeToRefs } from "pinia";
import AppDialog from "@/components/ui/AppDialog.vue";
import { PlatformAccount } from "@/models/platformAccount";
import { useAccountStore } from "@/stores/accountStore";
import { useUserStore } from "@/stores/userStore";
import type { PlatformId } from "@/types/esport";
import { ALL_PLATFORMS } from "@/types/userConfig";
import { pbProvider } from "@/providers/pbProvider";

const props = defineProps<{
  open: boolean;
  account?: PlatformAccount;
}>();

const emit = defineEmits<{ close: [] }>();

const accountStore = useAccountStore();
const userStore = useUserStore();
const { proxyList } = storeToRefs(userStore);

const saving = reactive({ value: false });
const pasteRaw = reactive({ value: "" });

const form = reactive({
  platformName: "",
  playerName: "",
  provider: "RAY" as PlatformId,
  proxyId: undefined as number | undefined,
  gateway: "",
  token: "",
  referer: "",
  userAgent: "",
  credit: 0,
  maxBalance: 0,
  maxBalanceOdds: 2,
  maxProfit: 0,
  maxWinBalance: 0,
  minOdds: 0,
  maxOdds: 0,
  maxOrder: 0,
  profit: 0,
  multiply: 1,
  pause: false,
  markupOnly: false,
  noMarkup: false,
  realName: "",
  mobile: "",
  city: "",
  description: "",
  rateConfig: [] as { minOdds: number; maxOdds: number; rate: number }[],
});

function resetForm(acc?: PlatformAccount) {
  if (acc) {
    form.platformName = acc.platformName || "";
    form.playerName = acc.playerName;
    form.provider = acc.provider;
    form.proxyId = acc.proxyId;
    form.gateway = acc.gateway || "";
    form.token = acc.token || "";
    form.referer = acc.referer || "";
    form.userAgent = acc.userAgent || "";
    form.credit = acc.credit ?? 0;
    form.maxBalance = acc.maxBalance ?? 0;
    form.maxBalanceOdds = acc.maxBalanceOdds ?? 2;
    form.maxProfit = acc.maxProfit ?? 0;
    form.maxWinBalance = acc.maxWinBalance ?? 0;
    form.minOdds = acc.minOdds ?? 0;
    form.maxOdds = acc.maxOdds ?? 0;
    form.maxOrder = acc.maxOrder ?? 0;
    form.profit = acc.profit ?? 0;
    form.multiply = acc.multiply ?? 1;
    form.pause = acc.pause ?? false;
    form.markupOnly = acc.markupOnly ?? false;
    form.noMarkup = acc.noMarkup ?? false;
    form.realName = acc.realName || "";
    form.mobile = acc.mobile || "";
    form.city = acc.city || "";
    form.description = acc.description || "";
    form.rateConfig = acc.rateConfig?.length ? [...acc.rateConfig.map((r) => ({ ...r }))] : [];
  } else {
    form.platformName = "";
    form.playerName = "";
    form.provider = "RAY";
    form.proxyId = undefined;
    form.gateway = "";
    form.token = "";
    form.referer = "";
    form.userAgent = "";
    form.credit = 0;
    form.maxBalance = 0;
    form.maxBalanceOdds = 2;
    form.maxProfit = 0;
    form.maxWinBalance = 0;
    form.minOdds = 0;
    form.maxOdds = 0;
    form.maxOrder = 0;
    form.profit = 0;
    form.multiply = 1;
    form.pause = false;
    form.markupOnly = false;
    form.noMarkup = false;
    form.realName = "";
    form.mobile = "";
    form.city = "";
    form.description = "";
    form.rateConfig = [];
  }
  pasteRaw.value = "";
}

watch(
  () => [props.open, props.account] as const,
  ([open, acc]) => {
    if (!open) return;
    void userStore.loadExtras();
    resetForm(acc);
  },
  { immediate: true },
);

function addRate() {
  form.rateConfig.push({ minOdds: 0, maxOdds: 0, rate: 1 });
}

function removeRate(index: number) {
  form.rateConfig.splice(index, 1);
}

async function pasteFromClipboard() {
  try {
    pasteRaw.value = await navigator.clipboard.readText();
    await applyPaste();
  } catch {
    window.alert("无法访问剪贴板，请手动粘贴到下方输入框后点「解析填充」");
  }
}

/** 对齐 A8 AccountInfoView：多 gateway 逐个 getBalance 测速 */
async function pickFastestPbGateway(
  gateways: string[],
  token: string,
  referer: string,
): Promise<string> {
  const ranked: { gate: string; time: number; success: boolean }[] = [];
  for (const gate of gateways) {
    const probe = new PlatformAccount({
      accountId: 0,
      provider: "PB",
      playerName: "",
      gateway: gate,
      token,
      referer,
      currency: "CNY",
      updateTime: Date.now(),
    });
    const started = Date.now();
    let success = false;
    try {
      const bal = await pbProvider.getBalance?.(probe);
      success = Boolean(bal);
    } catch {
      success = false;
    }
    ranked.push({ gate, time: Date.now() - started, success });
  }
  const best = ranked.filter((r) => r.success).sort((a, b) => a.time - b.time)[0];
  return best?.gate ?? gateways[0]!;
}

async function applyPaste() {
  if (!pasteRaw.value.trim()) return;
  try {
    const parsed = JSON.parse(window.atob(pasteRaw.value.trim())) as {
      provider?: PlatformId;
      token?: string;
      referer?: string;
      gateway?: string | string[];
    };
    if (!parsed?.provider) {
      window.alert("未选择场馆");
      return;
    }
    form.provider = parsed.provider;
    form.token = parsed.token ?? "";
    form.referer = parsed.referer ?? "";
    const gateways = Array.isArray(parsed.gateway)
      ? parsed.gateway
      : parsed.gateway
        ? [parsed.gateway]
        : [];
    if (!gateways.length) return;

    if (gateways.length === 1) {
      form.gateway = gateways[0];
      return;
    }

    if (parsed.provider === "PB" && parsed.token) {
      form.gateway = await pickFastestPbGateway(gateways, parsed.token, parsed.referer ?? "");
      return;
    }

    form.gateway = gateways[0];
    window.alert(`检测到 ${gateways.length} 个网关，已选用第一个：${gateways[0]}`);
  } catch {
    window.alert("解析失败，请确认剪贴板为 Base64 编码的 JSON");
  }
}

function buildPatch() {
  return {
    platformName: form.platformName.trim(),
    playerName: form.playerName.trim(),
    provider: form.provider,
    proxyId: form.proxyId,
    gateway: form.gateway.trim() || undefined,
    token: form.token.trim() || undefined,
    referer: form.referer.trim() || undefined,
    userAgent: form.userAgent.trim() || undefined,
    credit: Number(form.credit) || 0,
    maxBalance: Number(form.maxBalance) || 0,
    maxBalanceOdds: Number(form.maxBalanceOdds) || 2,
    maxProfit: Number(form.maxProfit) || 0,
    maxWinBalance: Number(form.maxWinBalance) || 0,
    minOdds: Number(form.minOdds) || 0,
    maxOdds: Number(form.maxOdds) || 0,
    maxOrder: Number(form.maxOrder) || 0,
    profit: Number(form.profit) || 0,
    multiply: Number(form.multiply) || 1,
    pause: form.pause,
    markupOnly: form.markupOnly,
    noMarkup: form.noMarkup,
    realName: form.realName.trim() || undefined,
    mobile: form.mobile.trim() || undefined,
    city: form.city.trim() || undefined,
    description: form.description.trim(),
    rateConfig: form.rateConfig.map((r) => ({ ...r })),
  };
}

async function save() {
  if (!form.platformName.trim() || !form.playerName.trim()) {
    window.alert("平台名与账号名必填");
    return;
  }
  saving.value = true;
  try {
    if (props.account) {
      props.account.applyPatch(buildPatch());
      await accountStore.saveAccounts();
    } else {
      await accountStore.createFromTagPlatform(buildPatch());
    }
    emit("close");
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <AppDialog
    :open="open"
    :title="account ? '平台账号设置' : '平台账号设置'"
    width="800px"
    @close="emit('close')"
  >
    <div class="form-scroll">
      <div class="paste-row">
        <button type="button" class="btn btn--ghost" @click="pasteFromClipboard">从剪贴板粘贴</button>
        <input v-model="pasteRaw.value" class="paste-input" placeholder="Base64 账号 JSON" />
        <button type="button" class="btn btn--ghost" @click="applyPaste">解析填充</button>
      </div>

      <div class="form-grid">
        <label>
          <span>平台标签</span>
          <input v-model="form.platformName" type="text" placeholder="如 RAY / OB01" />
        </label>
        <label>
          <span>账号名</span>
          <input v-model="form.playerName" type="text" />
        </label>
        <label>
          <span>场馆</span>
          <select v-model="form.provider">
            <option v-for="p in ALL_PLATFORMS" :key="p" :value="p">{{ p }}</option>
          </select>
        </label>
        <label>
          <span>代理</span>
          <select v-model="form.proxyId">
            <option :value="undefined">无</option>
            <option v-for="px in proxyList" :key="px.proxyId" :value="px.proxyId">
              {{ px.label || px.proxyId }}
            </option>
          </select>
        </label>
        <label class="span-2">
          <span>Gateway</span>
          <input v-model="form.gateway" type="text" />
        </label>
        <label class="span-2">
          <span>Token</span>
          <input v-model="form.token" type="text" />
        </label>
        <label class="span-2">
          <span>Referer</span>
          <input v-model="form.referer" type="text" />
        </label>
        <label class="span-2">
          <span>UserAgent</span>
          <input v-model="form.userAgent" type="text" />
        </label>
        <label>
          <span>信用额度</span>
          <input v-model.number="form.credit" type="number" />
        </label>
        <label>
          <span>余额上限</span>
          <input v-model.number="form.maxBalance" type="number" />
        </label>
        <label>
          <span>超额赔率</span>
          <input v-model.number="form.maxBalanceOdds" type="number" step="0.01" />
        </label>
        <label>
          <span>盈利上限</span>
          <input v-model.number="form.maxProfit" type="number" />
        </label>
        <label>
          <span>盈利余额上限</span>
          <input v-model.number="form.maxWinBalance" type="number" />
        </label>
        <label>
          <span>最小赔率</span>
          <input v-model.number="form.minOdds" type="number" step="0.01" />
        </label>
        <label>
          <span>最大赔率</span>
          <input v-model.number="form.maxOdds" type="number" step="0.01" />
        </label>
        <label>
          <span>日单上限</span>
          <input v-model.number="form.maxOrder" type="number" />
        </label>
        <label>
          <span>目标利润</span>
          <input v-model.number="form.profit" type="number" step="0.01" />
        </label>
        <label>
          <span>乘网倍数</span>
          <input v-model.number="form.multiply" type="number" step="0.1" />
        </label>
        <label class="span-2 check">
          <input v-model="form.pause" type="checkbox" />
          <span>暂停使用</span>
        </label>
        <label class="check">
          <input v-model="form.markupOnly" type="checkbox" />
          <span>仅限补单</span>
        </label>
        <label class="check">
          <input v-model="form.noMarkup" type="checkbox" />
          <span>不参与补单</span>
        </label>
        <label>
          <span>姓名</span>
          <input v-model="form.realName" type="text" />
        </label>
        <label>
          <span>手机</span>
          <input v-model="form.mobile" type="text" />
        </label>
        <label class="span-2">
          <span>城市</span>
          <input v-model="form.city" type="text" />
        </label>
        <label class="span-2">
          <span>备注</span>
          <input v-model="form.description" type="text" />
        </label>
      </div>

      <fieldset class="rate-block">
        <legend>
          投注比例
          <button type="button" class="link-btn" @click="addRate">+</button>
        </legend>
        <div v-for="(row, index) in form.rateConfig" :key="index" class="rate-row">
          <input v-model.number="row.minOdds" type="number" placeholder="低赔" step="0.01" />
          <input v-model.number="row.maxOdds" type="number" placeholder="高赔" step="0.01" />
          <input v-model.number="row.rate" type="number" placeholder="比例" step="0.01" />
          <button type="button" class="icon-btn" @click="removeRate(index)">×</button>
        </div>
      </fieldset>
    </div>

    <template #footer>
      <button type="button" class="btn btn--ghost" @click="emit('close')">取消</button>
      <button type="button" class="btn btn--primary" :disabled="saving.value" @click="save">
        {{ saving.value ? "保存中…" : "保存" }}
      </button>
    </template>
  </AppDialog>
</template>

<style scoped>
.form-scroll {
  max-height: 65vh;
  overflow: auto;
}
.paste-row {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  align-items: center;
}
.paste-input {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid #475569;
  border-radius: 4px;
  background: #0f172a;
  color: #e2e8f0;
  font-size: 12px;
}
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.form-grid label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #94a3b8;
}
.form-grid label.span-2 {
  grid-column: span 2;
}
.form-grid label.check {
  flex-direction: row;
  align-items: center;
}
.form-grid input,
.form-grid select {
  padding: 6px 8px;
  border: 1px solid #475569;
  border-radius: 4px;
  background: #0f172a;
  color: #e2e8f0;
}
.rate-block {
  margin-top: 12px;
  border: 1px solid #475569;
  border-radius: 6px;
  padding: 8px 10px;
}
.rate-block legend {
  font-size: 12px;
  color: #94a3b8;
  display: flex;
  align-items: center;
  gap: 8px;
}
.rate-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr auto;
  gap: 6px;
  margin-top: 6px;
}
.rate-row input {
  padding: 4px 6px;
  border: 1px solid #475569;
  border-radius: 4px;
  background: #0f172a;
  color: #e2e8f0;
}
.link-btn {
  border: none;
  background: none;
  color: #38bdf8;
  cursor: pointer;
  font-size: 14px;
}
.icon-btn {
  width: 28px;
  border: 1px solid #475569;
  border-radius: 4px;
  background: transparent;
  color: #fca5a5;
  cursor: pointer;
}
.btn {
  padding: 6px 14px;
  border-radius: 4px;
  border: 1px solid #475569;
  cursor: pointer;
  font-size: 13px;
}
.btn--ghost {
  background: transparent;
  color: #cbd5e1;
}
.btn--primary {
  background: #059669;
  border-color: #059669;
  color: #fff;
}
</style>
