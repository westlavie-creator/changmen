<script setup lang="ts">
import type { AccountEditFormState } from "@/components/account/accountEditFormState";
import { resolveAccountMultiply } from "@changmen/shared/account_multiply";
import { ElLoading, ElMessage } from "element-plus";
import { storeToRefs } from "pinia";
import { computed, reactive, ref, watch } from "vue";
import {
  createAccountEditFormStateFromPlatformAccount,
} from "@/components/account/accountEditFormState";
import {
  normalizePolymarketApiCreds,
  normalizePolymarketTokenObject,
  parsePastedAccountCredential,
  parsePolymarketTokenObject,
} from "@/components/account/accountCredentialParse";
import {
  createGatewayProbeAccount,
  pickFastestGateway,
} from "@/components/account/accountGatewayProbe";
import AccountEditPanel from "@/components/account/AccountEditPanel.vue";
import { updateAdminAccountMultiply } from "@/api/admin";
import { normalizeAccountRateConfig, PlatformAccount } from "@/models/platformAccount";
import { useAccountStore } from "@/stores/accountStore";
import { useUserStore } from "@/stores/userStore";
import { getApiBase } from "@/config/apiBase";
import { getToken } from "@/api/client";
import {
  createOrDerivePolymarketApiCreds,
  type PolymarketApiCreds,
} from "@venue/polymarket/credentials";
import {
  fetchPolymarketRelayerStatus,
  preparePolymarketWallet,
} from "@venue/polymarket/relayer";

const props = defineProps<{
  open: boolean;
  account?: PlatformAccount;
  readonly?: boolean;
  /** 管理端：目标用户 id，配合 allowMultiplyEdit 可改乘网 */
  adminTargetUserId?: string;
  allowMultiplyEdit?: boolean;
  previewForm?: AccountEditFormState;
  previewProxyOptions?: { label: string; value: number }[];
  zIndex?: number;
}>();

const emit = defineEmits<{ close: []; multiplySaved: [multiply: number] }>();

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
/** Polymarket 专用：新账号按 wallet/funder/privateKey 派生 API 凭证 */
const polyWalletAddress = ref("");
const polyFunder = ref("");
const polyPrivateKey = ref("");
const polyApiCreds = ref<PolymarketApiCreds>();
const polyApiCredsFingerprint = ref("");
const polyGenerating = ref(false);
const polyRelayerPreparing = ref(false);
const polyRelayerConfigured = ref<boolean | null>(null);

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
  syncPolymarketFieldsFromToken(form.token);
}

function syncPolymarketFieldsFromToken(token: string) {
  const parsed = parsePolymarketTokenObject(token) ?? {};
  polyWalletAddress.value = String(parsed.walletAddress ?? parsed.address ?? "");
  polyFunder.value = String(parsed.funder ?? parsed.funderAddress ?? "");
  polyPrivateKey.value = String(parsed.privateKey ?? parsed.private_key ?? "");
  polyApiCreds.value = normalizePolymarketApiCreds(parsed);
  polyApiCredsFingerprint.value = polyApiCreds.value ? polymarketCredentialFingerprint() : "";
}

function syncForm() {
  if (props.previewForm) {
    Object.assign(form, structuredClone(props.previewForm));
    pasteRaw.value = "";
    gameShow.value = true;
    rateLocked.value = form.provider === "PB";
    syncPolymarketFieldsFromToken(form.token);
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
    if (p === "Polymarket") {
      form.gateway ||= "https://clob.polymarket.com";
      form.referer ||= "https://polymarket.com/zh";
      syncPolymarketFieldsFromToken(form.token);
      void refreshPolymarketRelayerStatus();
    }
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
    syncPolymarketFieldsFromToken(form.token);

    if (gateways.length === 1) {
      ElMessage.success("粘贴成功");
      return;
    }

    loading = ElLoading.service({ fullscreen: true, text: "正在检测最快网关" });
    const gate = await pickFastestGateway(
      gateway => createGatewayProbeAccount({
        provider: parsed.provider!,
        gateway,
        token: parsed.token ?? "",
        referer: parsed.referer ?? "",
        proxyId: form.proxyId === 0 ? undefined : form.proxyId,
      }),
      gateways,
      ({ gate, time, success }) => {
        ElMessage({
          message: `${gate}，耗时：${time}ms`,
          type: success ? "success" : "error",
          duration: 3000,
        });
      },
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

function normalizeRateConfig() {
  return normalizeAccountRateConfig(form.rateConfig);
}

function polymarketCredentialFingerprint(): string {
  return [
    form.gateway.trim(),
    polyWalletAddress.value.trim().toLowerCase(),
    polyFunder.value.trim().toLowerCase(),
    polyPrivateKey.value.trim().toLowerCase(),
  ].join("|");
}

function buildPolyToken(): string {
  const token: Record<string, unknown> = {
    walletAddress: polyWalletAddress.value.trim(),
    funder: polyFunder.value.trim(),
    signatureType: "3",
    privateKey: polyPrivateKey.value.trim(),
  };
  if (polyApiCreds.value) {
    token.apiCreds = {
      apiKey: polyApiCreds.value.apiKey,
      secret: polyApiCreds.value.secret,
      passphrase: polyApiCreds.value.passphrase,
    };
  }
  normalizePolymarketTokenObject(token);
  return JSON.stringify(token);
}

async function ensurePolymarketToken(): Promise<string> {
  if (!polyWalletAddress.value.trim()) {
    throw new Error("Polymarket 钱包地址必填");
  }
  if (!polyFunder.value.trim()) {
    throw new Error("Polymarket funder 必填");
  }
  if (!polyPrivateKey.value.trim()) {
    throw new Error("Polymarket 私钥必填");
  }
  if (!polyApiCreds.value || polyApiCredsFingerprint.value !== polymarketCredentialFingerprint())
    await generatePolymarketApiCreds(true);
  const token = buildPolyToken();
  form.token = token;
  return token;
}

async function generatePolymarketApiCreds(silent = false) {
  polyGenerating.value = true;
  try {
    const result = await createOrDerivePolymarketApiCreds({
      gateway: form.gateway,
      walletAddress: polyWalletAddress.value,
      funder: polyFunder.value,
      privateKey: polyPrivateKey.value,
    });
    polyWalletAddress.value ||= result.signerAddress;
    polyApiCreds.value = result.apiCreds;
    form.gateway ||= "https://clob.polymarket.com";
    polyApiCredsFingerprint.value = polymarketCredentialFingerprint();
    form.token = buildPolyToken();
    if (!silent)
      ElMessage.success("Polymarket API 凭证已生成/派生");
  }
  finally {
    polyGenerating.value = false;
  }
}

async function onGeneratePolymarketApiCreds() {
  try {
    await generatePolymarketApiCreds(false);
  }
  catch (err) {
    ElMessage.error(err instanceof Error ? err.message : "Polymarket API 凭证生成失败");
  }
}

function polymarketRelayerSignUrl(): string {
  const base = getApiBase();
  const origin = base || (typeof window !== "undefined" ? window.location.origin : "");
  return `${origin.replace(/\/+$/, "")}/api/polymarket/relayer/sign`;
}

async function refreshPolymarketRelayerStatus() {
  const token = getToken();
  if (!token) {
    polyRelayerConfigured.value = null;
    return;
  }
  try {
    const status = await fetchPolymarketRelayerStatus(getApiBase(), token);
    polyRelayerConfigured.value = status.configured;
  }
  catch {
    polyRelayerConfigured.value = false;
  }
}

async function onPreparePolymarketWallet() {
  polyRelayerPreparing.value = true;
  try {
    if (!polyPrivateKey.value.trim())
      throw new Error("请先填写钱包私钥");
    const authToken = getToken();
    if (!authToken)
      throw new Error("请先登录");
    await refreshPolymarketRelayerStatus();
    if (polyRelayerConfigured.value === false)
      throw new Error("服务端未配置 Polymarket Relayer（POLY_BUILDER_*）");
    const result = await preparePolymarketWallet({
      privateKey: polyPrivateKey.value.trim(),
      signatureType: "3",
      signUrl: polymarketRelayerSignUrl(),
      authToken,
    });
    if (!result.ok)
      throw new Error(result.message);
    ElMessage.success(result.transactionHash
      ? `${result.message} tx=${result.transactionHash.slice(0, 10)}…`
      : result.message);
  }
  catch (err) {
    ElMessage.error(err instanceof Error ? err.message : "Polymarket 钱包初始化失败");
  }
  finally {
    polyRelayerPreparing.value = false;
  }
}

async function buildPatch() {
  const token = form.provider === "Polymarket"
    ? await ensurePolymarketToken()
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
    const patch = await buildPatch();
    if (props.account) {
      props.account.applyPatch(patch);
      await accountStore.saveAccounts();
      // [A8 可证实] Io.createAccount：update/push → save ACCOUNT → updateBalance → updateOrders
      await accountStore.refreshBalance(props.account);
      await accountStore.updateVenueOrders(props.account);
    }
    else {
      // [A8 可证实] 新建账号先 CreateTagPlatform 取得 playerId，再进入 Io.createAccount 链路
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

async function saveMultiplyAdmin() {
  if (!props.adminTargetUserId || !props.account)
    return;
  const multiply = resolveAccountMultiply(form.provider, form.multiply);
  saving.value = true;
  try {
    const updated = await updateAdminAccountMultiply({
      userId: props.adminTargetUserId,
      accountId: props.account.accountId,
      multiply,
    });
    form.multiply = updated.multiply;
    props.account.multiply = updated.multiply;
    ElMessage.success("乘网已保存");
    emit("multiplySaved", updated.multiply);
  }
  catch (err) {
    ElMessage.error(err instanceof Error ? err.message : "保存乘网失败");
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
    width="800"
    append-to-body
    :z-index="zIndex"
    :close-on-press-escape="false"
    :close-on-click-modal="false"
    title="平台账号设置"
  >
    <AccountEditPanel
      v-model:form="form"
      :readonly="readonly"
      :multiply-editable="Boolean(allowMultiplyEdit && adminTargetUserId)"
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
      <template v-if="form.provider === 'Polymarket'" #token>
        <fieldset class="poly-token-fieldset">
          <legend>Token</legend>
          <el-form-item label="钱包地址：">
            <el-input
              v-model="polyWalletAddress"
              placeholder="0x...，私钥对应的钱包地址"
              :disabled="readonly"
              style="font-family: monospace; font-size: 12px"
            />
          </el-form-item>
          <el-form-item label="Funder：">
            <el-input
              v-model="polyFunder"
              placeholder="0x...，Polymarket Deposit/Funder 地址"
              :disabled="readonly"
              style="font-family: monospace; font-size: 12px"
            />
          </el-form-item>
          <el-form-item label="钱包私钥：">
            <el-input
              v-model="polyPrivateKey"
              show-password
              placeholder="0x... 或不带前缀的 hex 私钥"
              :disabled="readonly"
              style="font-family: monospace; font-size: 12px"
            />
          </el-form-item>
          <el-form-item v-if="!readonly" label="API 凭证：">
            <el-button
              type="primary"
              plain
              :loading="polyGenerating"
              @click="onGeneratePolymarketApiCreds"
            >
              生成/验证 apiCreds
            </el-button>
            <el-button
              type="success"
              plain
              :loading="polyRelayerPreparing"
              :disabled="polyRelayerConfigured === false"
              @click="onPreparePolymarketWallet"
            >
              Relayer 链上授权
            </el-button>
            <span class="poly-credential-hint">
              {{ polyApiCreds ? "已生成，保存时会写入最小 token（signatureType=3）" : "保存时也会自动生成" }}
              <template v-if="polyRelayerConfigured === false">
                · 服务端 Relayer 未配置
              </template>
            </span>
          </el-form-item>
          <template v-if="polyApiCreds">
            <p class="poly-credential-readonly-hint">
              以下凭证由「生成/验证 apiCreds」自动派生，只读不可手改；变更钱包/私钥后请重新生成。
            </p>
            <el-form-item label="apiKey：">
              <el-input
                :model-value="polyApiCreds.apiKey"
                readonly
                class="poly-credential-readonly"
                style="font-family: monospace; font-size: 12px"
              />
            </el-form-item>
            <el-form-item label="secret：">
              <el-input
                :model-value="polyApiCreds.secret"
                readonly
                show-password
                class="poly-credential-readonly"
                style="font-family: monospace; font-size: 12px"
              />
            </el-form-item>
            <el-form-item label="passphrase：">
              <el-input
                :model-value="polyApiCreds.passphrase"
                readonly
                show-password
                class="poly-credential-readonly"
                style="font-family: monospace; font-size: 12px"
              />
            </el-form-item>
          </template>
        </fieldset>
      </template>

      <template v-if="allowMultiplyEdit && adminTargetUserId && account" #footer>
        <div class="el-form-submit flex flex-center">
          <el-button
            type="primary"
            size="large"
            style="width: 98%"
            :loading="saving"
            @click="saveMultiplyAdmin"
          >
            保存乘网
          </el-button>
        </div>
      </template>

      <template v-else-if="!readonly" #footer>
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

<style scoped>
.poly-token-fieldset {
  margin: 0 0 12px;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  padding: 12px 14px 4px;
}

.poly-token-fieldset legend {
  padding: 0 6px;
  font-size: 13px;
  font-weight: 600;
}

.poly-credential-hint {
  margin-left: 10px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.poly-credential-readonly-hint {
  margin: 0 0 10px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.poly-credential-readonly :deep(.el-input__wrapper) {
  background-color: var(--el-fill-color-light);
  box-shadow: 0 0 0 1px var(--el-border-color-lighter) inset;
  cursor: default;
}

.poly-credential-readonly :deep(.el-input__inner) {
  cursor: default;
  color: var(--el-text-color-regular);
}
</style>
