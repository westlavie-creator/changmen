<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { ElLoading, ElMessage } from "element-plus";
import { PlatformAccount } from "@/models/platformAccount";
import { useAccountStore } from "@/stores/accountStore";
import { useUserStore } from "@/stores/userStore";
import type { PlatformId } from "@/types/esport";
import { ALL_PLATFORMS } from "@/types/userConfig";
import { pbProvider } from "@platform/pb";

const props = defineProps<{
  open: boolean;
  account?: PlatformAccount;
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
    if (!v) emit("close");
  },
});
const pasteRaw = ref("");
const gameShow = ref(false);
/** A8：PB 默认锁定比例，legend「投」双击解锁 */
const rateLocked = ref(false);

type PlatformSuggestion = { value: string; link: string };

const form = reactive({
  platformName: "",
  playerName: "",
  provider: "RAY" as PlatformId,
  proxyId: 0,
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
  minDefault: 0,
  maxDefault: 0,
  maxOrder: 0,
  profit: 0,
  maxBetCount: 0,
  multiply: 1,
  pause: false,
  markupOnly: false,
  noMarkup: false,
  lastOdds: false,
  realName: "",
  mobile: "",
  city: "",
  description: "",
  workTimes: [] as string[],
  rateConfig: [] as { minOdds: number; maxOdds: number; rate: number }[],
  game: {} as Record<string, { betCount: number; profit: number; odds: string[] }>,
});

const platformSuggestions = computed<PlatformSuggestion[]>(() =>
  tagPlatforms.value.map((p) => ({
    value: p.Name || "",
    link: String(p.ID ?? ""),
  })),
);

const proxyOptions = computed(() => [
  { label: "无代理", value: 0 },
  ...proxyList.value.map((px) => ({
    label: px.label || String(px.proxyId),
    value: px.proxyId,
  })),
]);

function defaultGameMap() {
  return JSON.parse(JSON.stringify(new PlatformAccount({ accountId: 0, playerName: "", provider: "RAY" }).game));
}

function resetForm(acc?: PlatformAccount) {
  const src = acc ?? new PlatformAccount({ accountId: 0, playerName: "", provider: "RAY" });
  form.platformName = src.platformName || "";
  form.playerName = src.playerName ?? "";
  form.provider = src.provider;
  form.proxyId = src.proxyId ?? 0;
  form.gateway = src.gateway || "";
  form.token = src.token || "";
  form.referer = src.referer || "";
  form.userAgent = src.userAgent || "";
  form.credit = src.credit ?? 0;
  form.maxBalance = src.maxBalance ?? 0;
  form.maxBalanceOdds = src.maxBalanceOdds ?? 2;
  form.maxProfit = src.maxProfit ?? 0;
  form.maxWinBalance = src.maxWinBalance ?? 0;
  form.minOdds = src.minOdds ?? 0;
  form.maxOdds = src.maxOdds ?? 0;
  form.minDefault = src.minDefault ?? 0;
  form.maxDefault = src.maxDefault ?? 0;
  form.maxOrder = src.maxOrder ?? 0;
  form.profit = src.profit ?? 0;
  form.maxBetCount = src.maxBetCount ?? 0;
  form.multiply = src.multiply ?? 1;
  form.pause = src.pause ?? false;
  form.markupOnly = src.markupOnly ?? false;
  form.noMarkup = src.noMarkup ?? false;
  form.lastOdds = src.lastOdds ?? false;
  form.realName = src.realName || "";
  form.mobile = src.mobile || "";
  form.city = src.city || "";
  form.description = src.description || "";
  form.workTimes = src.workTimes?.length ? [...src.workTimes] : [];
  form.rateConfig = src.rateConfig?.length ? src.rateConfig.map((r) => ({ ...r })) : [];
  form.game = JSON.parse(JSON.stringify(src.game ?? defaultGameMap()));
  pasteRaw.value = "";
  gameShow.value = false;
  rateLocked.value = form.provider === "PB";
}

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    void userStore.loadExtras();
    void accountStore.loadTagPlatforms();
    resetForm(props.account);
  },
);

watch(
  () => form.provider,
  (p) => {
    rateLocked.value = p === "PB";
  },
);

function queryPlatforms(query: string, cb: (rows: PlatformSuggestion[]) => void) {
  const q = query.trim();
  const list = q
    ? platformSuggestions.value.filter((s) => s.value.includes(q))
    : platformSuggestions.value;
  cb(list);
}

function addRate() {
  form.rateConfig.push({ minOdds: 0, maxOdds: 0, rate: 1 });
}

function removeRate(index: number) {
  if (index >= 0 && index < form.rateConfig.length) form.rateConfig.splice(index, 1);
}

function normalizeGameOdds(gameName: string) {
  const g = form.game[gameName];
  if (!g) return;
  const next: string[] = [];
  for (const raw of g.odds) {
    const [lo, hi] = raw.split("-").map((x) => Number(x));
    if (!Number.isNaN(lo) && !Number.isNaN(hi) && lo <= hi) next.push(`${lo}-${hi}`);
  }
  g.odds = next;
}

function onMarkupOnlyChange() {
  if (form.markupOnly) form.noMarkup = false;
}

function onNoMarkupChange() {
  if (form.noMarkup) form.markupOnly = false;
}

async function pasteFromClipboard() {
  try {
    pasteRaw.value = await navigator.clipboard.readText();
    await applyPaste();
  } catch {
    ElMessage.error("无法访问剪贴板，请检查浏览器权限或手动粘贴！");
  }
}

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
    const ms = Date.now() - started;
    ranked.push({ gate, time: ms, success });
    ElMessage({
      message: `${gate}，耗时：${ms}ms`,
      type: success ? "success" : "error",
      duration: 3000,
    });
  }
  const fast = ranked.filter((r) => r.success && r.time < 500);
  const best =
    fast.length > 0
      ? fast[Math.floor(Math.random() * fast.length)]!
      : ranked.filter((r) => r.success).sort((a, b) => a.time - b.time)[0];
  return best?.gate ?? "";
}

async function applyPaste() {
  if (!pasteRaw.value.trim()) return;
  let loading: ReturnType<typeof ElLoading.service> | undefined;
  try {
    const parsed = JSON.parse(window.atob(pasteRaw.value.trim())) as {
      provider?: PlatformId;
      token?: string;
      referer?: string;
      gateway?: string | string[];
    };
    if (!parsed?.provider) {
      ElMessage({ message: "未选择场馆", type: "error", plain: true });
      return;
    }
    const gateways = Array.isArray(parsed.gateway)
      ? parsed.gateway
      : parsed.gateway
        ? [parsed.gateway]
        : [];
    if (!gateways.length) return;

    form.provider = parsed.provider;
    form.token = parsed.token ?? "";
    form.referer = parsed.referer ?? "";

    if (gateways.length === 1) {
      form.gateway = gateways[0]!;
      ElMessage.success("粘贴成功");
      return;
    }

    loading = ElLoading.service({ fullscreen: true, text: "正在检测最快网关" });
    if (parsed.provider === "PB" && parsed.token) {
      const gate = await pickFastestPbGateway(gateways, parsed.token, parsed.referer ?? "");
      if (!gate) {
        ElMessage.error("当前网关测试失败");
        form.gateway = "";
      } else {
        form.gateway = gate;
      }
    } else {
      form.gateway = gateways[0]!;
      ElMessage.warning(`检测到 ${gateways.length} 个网关，已选用第一个：${gateways[0]}`);
    }
    ElMessage.success("粘贴成功");
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : "解析失败");
  } finally {
    loading?.close();
    pasteRaw.value = "";
  }
}

function normalizeRateConfig() {
  return form.rateConfig
    .map((r) => ({
      minOdds: Number(r.minOdds) || 0,
      maxOdds: Number(r.maxOdds) || 0,
      rate: Number(r.rate),
    }))
    .filter((r) => !Number.isNaN(r.rate));
}

function buildPatch() {
  return {
    platformName: form.platformName.trim(),
    playerName: form.playerName.trim(),
    provider: form.provider,
    proxyId: form.proxyId === 0 ? undefined : form.proxyId,
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
    minDefault: Number(form.minDefault) || 0,
    maxDefault: Number(form.maxDefault) || 0,
    maxOrder: Number(form.maxOrder) || 0,
    profit: Number(form.profit) || 0,
    maxBetCount: Number(form.maxBetCount) || 0,
    multiply: Number(form.multiply) || 1,
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
  if (!form.platformName.trim() || !form.playerName.trim()) {
    ElMessage.error("平台名与账号名必填");
    return;
  }
  const invalidRate = form.rateConfig.some((r) => Number.isNaN(Number(r.rate)));
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
      // [A8 可证实] AccountInfoView 保存后 updateBalance → updateOrders
      await accountStore.refreshBalance(props.account);
    } else {
      await accountStore.createFromTagPlatform(patch);
    }
    ElMessage.success("账号设置已保存");
    emit("close");
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : "保存失败");
  } finally {
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
    :close-on-press-escape="false"
    :close-on-click-modal="false"
  >
    <el-form label-width="100">
      <el-form-item label="平台：">
        <el-row :gutter="10">
          <el-col :span="6">
            <el-autocomplete
              v-model="form.platformName"
              clearable
              :fetch-suggestions="queryPlatforms"
              value-key="value"
            />
          </el-col>
          <el-col :span="7">
            <el-input v-model="form.playerName" placeholder="账号">
              <template #prepend>账号</template>
            </el-input>
          </el-col>
          <el-col :span="6">
            <el-switch
              v-model="form.pause"
              size="large"
              inline-prompt
              active-text="暂停账号"
              inactive-text="暂停账号"
              style="height: 24px; --el-switch-on-color: #f56c6c"
            />
          </el-col>
        </el-row>
      </el-form-item>

      <fieldset>
        <legend>
          <span @dblclick="unlockRate">投</span>
          注比例
          <el-button size="small" type="info" link @click="addRate">
            <i class="am-icon-plus am-icon-fw" />
          </el-button>
        </legend>
        <el-form-item
          v-for="(row, index) in form.rateConfig"
          :key="index"
          :label="`比例配置${index + 1}:`"
        >
          <el-row :gutter="10">
            <el-col :span="6">
              <el-input v-model.number="row.minOdds" type="number" placeholder="最低赔率">
                <template #prepend>低赔</template>
              </el-input>
            </el-col>
            <el-col :span="6">
              <el-input v-model.number="row.maxOdds" type="number" placeholder="最高赔率">
                <template #prepend>高赔</template>
              </el-input>
            </el-col>
            <el-col :span="6">
              <el-input
                v-model.number="row.rate"
                type="number"
                placeholder="比例"
                :disabled="rateLocked"
              >
                <template #prepend>比例</template>
              </el-input>
            </el-col>
            <el-col :span="6">
              <el-button size="small" type="danger" @click="removeRate(index)">
                <i class="am-icon-times" />
              </el-button>
            </el-col>
          </el-row>
        </el-form-item>
      </fieldset>

      <fieldset class="game-container" :class="{ show: gameShow }">
        <legend>
          游戏配置
          <el-button size="small" type="info" link @click="gameShow = !gameShow">
            <i class="am-icon-arrow-circle-down am-icon-fw" />
          </el-button>
        </legend>
        <div class="game-container-setting">
          <el-form-item
            v-for="[gameName, gameRow] in Object.entries(form.game)"
            :key="gameName"
            :label="`${gameName}：`"
          >
            <el-row v-if="gameRow" :gutter="10">
              <el-col :span="6">
                <el-input v-model.number="gameRow.profit" placeholder="利润">
                  <template #prepend>利润</template>
                </el-input>
              </el-col>
              <el-col :span="6">
                <el-input v-model.number="gameRow.betCount" placeholder="订单量">
                  <template #prepend>订单数</template>
                </el-input>
              </el-col>
              <el-col :span="12">
                <el-input-tag
                  v-model="gameRow.odds"
                  placeholder="赔率范围"
                  @change="normalizeGameOdds(gameName)"
                >
                  <template #prepend>赔率</template>
                </el-input-tag>
              </el-col>
            </el-row>
          </el-form-item>
        </div>
      </fieldset>

      <el-divider />

      <el-row>
        <el-col :span="12">
          <el-form-item label="初始赔率：">
            <el-row :gutter="10">
              <el-col :span="12">
                <el-input v-model.number="form.minDefault" placeholder="最低">
                  <template #prepend>最低</template>
                </el-input>
              </el-col>
              <el-col :span="12">
                <el-input v-model.number="form.maxDefault" placeholder="最高">
                  <template #prepend>最高</template>
                </el-input>
              </el-col>
            </el-row>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="投注赔率：">
            <el-row :gutter="10">
              <el-col :span="12">
                <el-input v-model.number="form.minOdds" placeholder="最低">
                  <template #prepend>最低</template>
                </el-input>
              </el-col>
              <el-col :span="12">
                <el-input v-model.number="form.maxOdds" placeholder="最高">
                  <template #prepend>最高</template>
                </el-input>
              </el-col>
            </el-row>
          </el-form-item>
        </el-col>
      </el-row>

      <el-row>
        <el-col :span="24">
          <el-form-item label="补单配置：">
            <el-row :gutter="10">
              <el-col :span="5">
                <el-switch
                  v-model="form.markupOnly"
                  size="large"
                  inline-prompt
                  active-text="仅限补单"
                  inactive-text="仅限补单"
                  style="height: 24px"
                  @change="onMarkupOnlyChange"
                />
              </el-col>
              <el-col :span="5">
                <el-switch
                  v-model="form.noMarkup"
                  size="large"
                  inline-prompt
                  active-text="不参与补单"
                  inactive-text="不参与补单"
                  style="height: 24px"
                  @change="onNoMarkupChange"
                />
              </el-col>
              <el-col :span="6">
                <el-input v-model.number="form.profit" type="number" placeholder="利润">
                  <template #prepend>利润</template>
                </el-input>
              </el-col>
              <el-col :span="6">
                <el-input v-model.number="form.maxBetCount" type="number" placeholder="下注单数">
                  <template #prepend>盘口订单</template>
                </el-input>
              </el-col>
            </el-row>
          </el-form-item>
        </el-col>
      </el-row>

      <el-row>
        <el-col :span="24">
          <el-row :gutter="10">
            <el-col :span="10">
              <el-form-item label="工作时间：">
                <el-input-tag
                  v-model="form.workTimes"
                  placeholder="格式:0-5，按回车添加"
                />
              </el-form-item>
            </el-col>
            <el-col :span="7">
              <el-switch
                v-model="form.lastOdds"
                size="large"
                inline-prompt
                active-text="赔率大于上笔"
                inactive-text="赔率大于上笔"
              />
            </el-col>
            <el-col :span="3">
              <el-input v-model.number="form.multiply" type="number" placeholder="乘网倍数" readonly>
                <template #prepend>乘网</template>
              </el-input>
            </el-col>
          </el-row>
        </el-col>
      </el-row>

      <el-form-item label="盈利上限：">
        <el-row :gutter="10">
          <el-col :span="4">
            <el-input v-model="form.maxProfit" />
          </el-col>
          <el-col :span="6">
            <el-input v-model.number="form.maxOrder" placeholder="单日最多订单">
              <template #prepend>单日订单</template>
            </el-input>
          </el-col>
          <el-col :span="7">
            <el-input v-model="form.maxBalance" placeholder="最大余额">
              <template #prepend>最大余额</template>
            </el-input>
          </el-col>
          <el-col :span="6">
            <el-input v-model="form.maxBalanceOdds" placeholder="超额赔率">
              <template #prepend>超额赔率</template>
            </el-input>
          </el-col>
        </el-row>
      </el-form-item>

      <el-form-item label="盈利余额：">
        <el-row :gutter="10">
          <el-col :span="4">
            <el-tooltip
              content="账户余额加未结算订单(算赢)不能超过此项设定"
              placement="top"
              effect="dark"
            >
              <el-input v-model="form.maxWinBalance" />
            </el-tooltip>
          </el-col>
          <el-col :span="6">
            <el-input v-model="form.realName">
              <template #prepend>姓名</template>
            </el-input>
          </el-col>
          <el-col :span="7">
            <el-input v-model="form.mobile">
              <template #prepend>手机</template>
            </el-input>
          </el-col>
          <el-col :span="6">
            <el-input v-model="form.city">
              <template #prepend>城市</template>
            </el-input>
          </el-col>
        </el-row>
      </el-form-item>

      <el-form-item label="账号备注：">
        <el-input v-model="form.description" />
      </el-form-item>

      <el-form-item label="场馆：">
        <el-radio-group v-model="form.provider">
          <el-radio v-for="p in ALL_PLATFORMS" :key="p" :value="p" size="large">
            {{ p }}
          </el-radio>
        </el-radio-group>
      </el-form-item>

      <el-form-item label="网关：">
        <el-input v-model="form.gateway" />
      </el-form-item>
      <el-form-item label="Token：">
        <el-input v-model="form.token" />
      </el-form-item>
      <el-form-item label="Referer：">
        <el-input v-model="form.referer" />
      </el-form-item>
      <el-form-item label="UserAgent:">
        <el-input
          v-model="form.userAgent"
          placeholder="请求访问的浏览器标识，不知道可留空"
        />
      </el-form-item>

      <el-form-item label="使用代理：">
        <el-radio-group v-model="form.proxyId">
          <el-radio v-for="opt in proxyOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </el-radio>
        </el-radio-group>
      </el-form-item>

      <el-form-item label="快速填充：">
        <el-input
          v-model="pasteRaw"
          placeholder="通过插件获取到的数据快速填充进入"
          @change="applyPaste"
        >
          <template #append>
            <div class="parse" @click="pasteFromClipboard">粘贴</div>
          </template>
        </el-input>
      </el-form-item>
    </el-form>

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
  </el-dialog>
</template>
