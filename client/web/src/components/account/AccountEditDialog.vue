<script setup lang="ts">
import type { AccountEditFormState } from "@/components/account/accountEditFormState";
import type { PlatformId } from "@/types/esport";
import { resolveAccountMultiply } from "@changmen/shared/account_multiply";
import { ElLoading, ElMessage } from "element-plus";
import { storeToRefs } from "pinia";
import { computed, reactive, ref, watch } from "vue";
import {

  createAccountEditFormStateFromPlatformAccount,
} from "@/components/account/accountEditFormState";
import AccountEditPanel from "@/components/account/AccountEditPanel.vue";
import { normalizeAccountRateConfig, PlatformAccount } from "@/models/platformAccount";
import { getProvider } from "@/runtime/providers";
import { useAccountStore } from "@/stores/accountStore";
import { useUserStore } from "@/stores/userStore";

const props = defineProps<{
  open: boolean;
  account?: PlatformAccount;
  readonly?: boolean;
  previewForm?: AccountEditFormState;
  previewProxyOptions?: { label: string; value: number }[];
  zIndex?: number;
}>();

const emit = defineEmits<{ close: [] }>();

const accountStore = useAccountStore();
const userStore = useUserStore();
const { proxyList } = storeToRefs(userStore);
const { tagPlatforms } = storeToRefs(accountStore);

const saving = ref(false);

/** 与 UserConfigDialog 一致：避免 v-model 与 @closed 竞态导致弹窗闪关 */
const visible = computed({
  get: () => props.open,
  set: (v: boolean) => {
    if (!v)
      emit("close");
  },
});
const pasteRaw = ref("");
const gameShow = ref(false);
/** A8：PB 默认锁定比例，legend「投」双击解锁 */
const rateLocked = ref(false);
/** Polymarket 专用：私钥单独录入，保存时写入 token JSON */
const polyPrivateKey = ref("");

interface PlatformSuggestion { value: string; link: string }

let form = reactive<AccountEditFormState>(
  createAccountEditFormStateFromPlatformAccount(
    new PlatformAccount({ accountId: 0, playerName: "", provider: "RAY" }),
  ),
);

const platformSuggestions = computed<PlatformSuggestion[]>(() =>
  tagPlatforms.value.map(p => ({
    value: p.Name || "",
    link: String(p.ID ?? ""),
  })),
);

const proxyOptions = computed(() => {
  if (props.previewProxyOptions?.length)
    return props.previewProxyOptions;
  return [
    { label: "无代理", value: 0 },
    ...proxyList.value.map(px => ({
      label: px.label || String(px.proxyId),
      value: px.proxyId,
    })),
  ];
});

function resetForm(acc?: PlatformAccount) {
  const src = acc ?? new PlatformAccount({ accountId: 0, playerName: "", provider: "RAY" });
  Object.assign(form, createAccountEditFormStateFromPlatformAccount(src));
  pasteRaw.value = "";
  gameShow.value = false;
  rateLocked.value = form.provider === "PB";
  polyPrivateKey.value = extractPolyPrivateKey(form.token);
}

function extractPolyPrivateKey(token: string): string {
  try {
    const parsed = JSON.parse(token);
    return parsed?.privateKey || parsed?.private_key || "";
  }
  catch {
    return "";
  }
}

function syncForm() {
  if (props.previewForm) {
    Object.assign(form, structuredClone(props.previewForm));
    pasteRaw.value = "";
    gameShow.value = true;
    rateLocked.value = form.provider === "PB";
    return;
  }
  resetForm(props.account);
}

watch(
  () => props.open,
  (open) => {
    if (!open)
      return;
    if (props.previewForm) {
      syncForm();
      return;
    }
    void userStore.loadExtras();
    void accountStore.loadTagPlatforms();
    resetForm(props.account);
  },
);

watch(
  () => form.provider,
  (p) => {
    rateLocked.value = p === "PB";
    form.multiply = resolveAccountMultiply(p, form.multiply);
  },
);

function queryPlatforms(query: string, cb: (rows: PlatformSuggestion[]) => void) {
  const q = query.trim();
  const list = q
    ? platformSuggestions.value.filter(s => s.value.includes(q))
    : platformSuggestions.value;
  cb(list);
}

function addRate() {
  form.rateConfig.push({ minOdds: 0, maxOdds: 0, rate: 1 });
}

function removeRate(index: number) {
  if (index >= 0 && index < form.rateConfig.length)
    form.rateConfig.splice(index, 1);
}

function normalizeGameOdds(gameName: string) {
  const g = form.game[gameName];
  if (!g)
    return;
  const next: string[] = [];
  for (const raw of g.odds) {
    const [lo, hi] = raw.split("-").map(x => Number(x));
    if (!Number.isNaN(lo) && !Number.isNaN(hi) && lo <= hi)
      next.push(`${lo}-${hi}`);
  }
  g.odds = next;
}

function onMarkupOnlyChange() {
  if (form.markupOnly)
    form.noMarkup = false;
}

function onNoMarkupChange() {
  if (form.noMarkup)
    form.markupOnly = false;
}

async function pasteFromClipboard() {
  try {
    pasteRaw.value = await navigator.clipboard.readText();
    await applyPaste();
  }
  catch {
    ElMessage.error("无法访问剪贴板，请检查浏览器权限或手动粘贴！");
  }
}

/** [A8 可证实] AccountInfoView：gateway.length>1 时对各 gateway 调 GetProvider().getBalance() 测速 */
async function pickFastestGateway(
  provider: PlatformId,
  gateways: string[],
  token: string,
  referer: string,
  proxyId?: number,
): Promise<string> {
  const ranked: { gate: string; time: number; success: boolean }[] = [];
  for (const gate of gateways) {
    const probe = new PlatformAccount({
      accountId: 0,
      provider,
      playerName: "",
      gateway: gate,
      token,
      referer,
      proxyId,
      currency: "CNY",
      updateTime: Date.now(),
    });
    const platformProvider = getProvider(probe);
    const probeBalance = platformProvider?.getBalance?.bind(platformProvider);
    const started = Date.now();
    let success = false;
    try {
      success = probeBalance ? Boolean(await probeBalance(probe)) : false;
    }
    catch {
      success = false;
    }
    const ms = Date.now() - started;
    ranked.push({ gate, time: ms, success });
    ElMessage({
      message: `${gate}，耗时：${ms}ms`,
      type: success ? "success" : "error",
      duration: 3000,
    });
  }
  const fast = ranked.filter(r => r.success && r.time < 500);
  const best
    = fast.length > 0
      ? fast[Math.floor(Math.random() * fast.length)]!
      : ranked.filter(r => r.success).sort((a, b) => a.time - b.time)[0];
  return best?.gate ?? "";
}

async function applyPaste() {
  if (!pasteRaw.value.trim())
    return;
  let loading: ReturnType<typeof ElLoading.service> | undefined;
  try {
    const parsed = parsePastedAccountCredential(pasteRaw.value.trim());
    if (!parsed) {
      ElMessage.error("解析失败");
      return;
    }
    if (!parsed?.provider) {
      ElMessage({ message: "未选择场馆", type: "error", plain: true });
      return;
    }
    const gateways = Array.isArray(parsed.gateway)
      ? parsed.gateway
      : parsed.gateway
        ? [parsed.gateway]
        : [];
    if (!gateways.length)
      return;

    form.provider = parsed.provider;
    form.token = parsed.token ?? "";
    form.referer = parsed.referer ?? "";
    form.gateway = gateways[0]!;
    polyPrivateKey.value = extractPolyPrivateKey(form.token);

    if (gateways.length === 1) {
      ElMessage.success("粘贴成功");
      return;
    }

    loading = ElLoading.service({ fullscreen: true, text: "正在检测最快网关" });
    const gate = await pickFastestGateway(
      parsed.provider,
      gateways,
      parsed.token ?? "",
      parsed.referer ?? "",
      form.proxyId === 0 ? undefined : form.proxyId,
    );
    if (!gate) {
      ElMessage.error("当前网关测试失败");
      form.gateway = "";
    }
    else {
      form.gateway = gate;
    }
    ElMessage.success("粘贴成功");
  }
  catch (err) {
    ElMessage.error(err instanceof Error ? err.message : "解析失败");
  }
  finally {
    loading?.close();
    pasteRaw.value = "";
  }
}

function parsePastedAccountCredential(raw: string): {
      provider?: PlatformId;
      token?: string;
      referer?: string;
      gateway?: string | string[];
} | undefined {
  const parsed = tryParseJson(raw) ?? tryParseJson(decodeBase64Utf8(raw));
  if (!parsed)
    return undefined;
  if (parsed.provider) {
    const credential = parsed as ReturnType<typeof parsePastedAccountCredential>;
    if (
      credential?.provider === "Polymarket"
      && !credential.token
    ) {
      credential.token = JSON.stringify({
        walletAddress: parsed.walletAddress,
        address: parsed.address,
        funder: parsed.funder,
        signatureType: parsed.signatureType,
        privateKey: parsed.privateKey,
        private_key: parsed.private_key,
        apiKey: parsed.apiKey,
        key: parsed.key,
        secret: parsed.secret,
        passphrase: parsed.passphrase,
        apiCreds: parsed.apiCreds,
        polyHeaders: parsed.polyHeaders,
      });
    }
    return credential;
  }
  if (
    parsed.walletAddress
    || parsed.address
    || parsed.apiCreds
    || parsed.apiKey
    || parsed.key
    || parsed.secret
    || parsed.passphrase
    || parsed.privateKey
    || parsed.private_key
  ) {
    return {
      provider: "Polymarket",
      gateway: "https://clob.polymarket.com",
      token: JSON.stringify(parsed),
      referer: "",
    };
  }
  return undefined;
}

function tryParseJson(raw: string | undefined): Record<string, unknown> | undefined {
  if (!raw)
    return undefined;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : undefined;
  }
  catch {
    return undefined;
  }
}

function decodeBase64Utf8(raw: string): string | undefined {
  try {
    const binary = window.atob(raw);
    const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  catch {
    return undefined;
  }
}

function normalizeRateConfig() {
  return normalizeAccountRateConfig(form.rateConfig);
}

function buildPolyToken(): string {
  let parsed: Record<string, unknown> = {};
  try { parsed = JSON.parse(form.token) ?? {}; }
  catch { /* keep empty */ }
  const key = polyPrivateKey.value.trim();
  if (key)
    parsed.privateKey = key;
  else
    delete parsed.privateKey;
  delete parsed.private_key;
  return JSON.stringify(parsed);
}

function buildPatch() {
  const token = form.provider === "Polymarket"
    ? buildPolyToken()
    : form.token.trim() || undefined;
  return {
    platformName: form.platformName.trim(),
    playerName: form.playerName.trim(),
    provider: form.provider,
    proxyId: form.proxyId === 0 ? undefined : form.proxyId,
    gateway: form.gateway.trim() || undefined,
    token: token || undefined,
    referer: form.referer.trim() || undefined,
    userAgent: form.userAgent.trim() || undefined,
    credit: Number(form.credit) || 0,
    maxBalance: Number(form.maxBalance) || 0,
    maxBalanceOdds: Number(form.maxBalanceOdds) || 2,
    maxProfit: Number(form.maxProfit) || 0,
    maxWinBalance: Number(form.maxWinBalance) || 0,
    minOdds: Number(form.minOdds) || 0,
    maxOdds: Number(form.maxOdds) || 0,
    minDefault: Number(form.minDefault) || 0,
    maxDefault: Number(form.maxDefault) || 0,
    maxOrder: Number(form.maxOrder) || 0,
    profit: Number(form.profit) || 0,
    maxBetCount: Number(form.maxBetCount) || 0,
    multiply: resolveAccountMultiply(form.provider, form.multiply),
    pause: form.pause,
    markupOnly: form.markupOnly,
    noMarkup: form.noMarkup,
    lastOdds: form.lastOdds,
    realName: form.realName.trim() || undefined,
    mobile: form.mobile.trim() || undefined,
    city: form.city.trim() || undefined,
    description: form.description.trim(),
    workTimes: [...form.workTimes],
    rateConfig: normalizeRateConfig(),
    game: JSON.parse(JSON.stringify(form.game)),
  };
}

async function save() {
  if (props.readonly)
    return;
  if (!form.platformName.trim() || !form.playerName.trim()) {
    ElMessage.error("平台名与账号名必填");
    return;
  }
  const invalidRate = form.rateConfig.some(r => Number.isNaN(Number(r.rate)));
  if (invalidRate) {
    ElMessage.error("投注比例不能为空，请填写有效数字");
    return;
  }
  saving.value = true;
  try {
    const patch = buildPatch();
    if (props.account) {
      props.account.applyPatch(patch);
      await accountStore.saveAccounts();
      // [A8 可证实] 新建：CreateTagPlatform → createAccount → updateBalance + updateOrders
      await accountStore.refreshBalance(props.account);
      await accountStore.updateVenueOrders(props.account);
    }
    else {
      await accountStore.createFromTagPlatform(patch);
    }
    ElMessage.success("账号设置已保存");
    emit("close");
  }
  catch (err) {
    ElMessage.error(err instanceof Error ? err.message : "保存失败");
  }
  finally {
    saving.value = false;
  }
}

function unlockRate() {
  rateLocked.value = false;
}
</script>

<template>
  <el-dialog
    v-model="visible"
    title="平台账号设置"
    width="800"
    append-to-body
    :z-index="zIndex"
    :close-on-press-escape="false"
    :close-on-click-modal="false"
  >
    <AccountEditPanel
      v-model:form="form"
      :readonly="readonly"
      :hide-sensitive="Boolean(previewForm)"
      :rate-locked="rateLocked"
      :game-expanded="gameShow"
      :proxy-options="proxyOptions"
      :fetch-platforms="previewForm ? undefined : queryPlatforms"
      @unlock-rate="unlockRate"
      @add-rate="addRate"
      @remove-rate="removeRate"
      @markup-only-change="onMarkupOnlyChange"
      @no-markup-change="onNoMarkupChange"
      @normalize-game-odds="normalizeGameOdds"
    >
      <template v-if="!readonly" #footer>
        <el-form-item v-if="form.provider === 'Polymarket'" label="钱包私钥：">
          <el-input
            v-model="polyPrivateKey"
            show-password
            placeholder="0x... 或不带前缀的 hex 私钥"
            style="font-family: monospace; font-size: 12px"
          />
        </el-form-item>
        <el-form-item label="快速填充：">
          <el-input
            v-model="pasteRaw"
            placeholder="通过插件获取到的数据快速填充进入"
            @change="applyPaste"
          >
            <template #append>
              <div class="parse" @click="pasteFromClipboard">
                粘贴
              </div>
            </template>
          </el-input>
        </el-form-item>

        <div class="el-form-submit flex flex-center">
          <el-button
            type="primary"
            size="large"
            style="width: 98%"
            :loading="saving"
            @click="save"
          >
            保存
          </el-button>
        </div>
      </template>
    </AccountEditPanel>
  </el-dialog>
</template>
