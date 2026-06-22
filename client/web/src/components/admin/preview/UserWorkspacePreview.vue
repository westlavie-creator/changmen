<script setup lang="ts">
import type { AdminUserRow } from "@/types/admin";
import { storeToRefs } from "pinia";
import { computed, reactive, watch } from "vue";
import AccountBar from "@/components/account/AccountBar.vue";
import AccountEditDialog from "@/components/account/AccountEditDialog.vue";
import { BET_SORTING_LABELS, createUserConfigFormState, waitTimePlatformPairs } from "@/components/user/userConfigFormState";
import { useAccountStore } from "@/stores/accountStore";
import { useConfigStore } from "@/stores/configStore";
import { useUserStore } from "@/stores/userStore";

defineProps<{ user: AdminUserRow }>();
defineEmits<{ viewOrders: [] }>();

const accountStore = useAccountStore();
const { editDialogOpen, editDialogAccount } = storeToRefs(accountStore);
const configStore = useConfigStore();
const userStore = useUserStore();

let form = reactive(createUserConfigFormState(configStore.config));
watch(() => configStore.config, c => Object.assign(form, createUserConfigFormState(c)));

const platformPairs = waitTimePlatformPairs();

const sortingLabel = computed(() => BET_SORTING_LABELS[form.betSorting] || form.betSorting);
</script>

<template>
  <div class="wp">
    <AccountEditDialog
      :open="editDialogOpen"
      :account="editDialogAccount"
      readonly
      @close="accountStore.closeAccountDialog()"
    />

    <section class="wp__sec">
      <h3 class="wp__h">Telegram</h3>
      <div class="wp__row">
        <span class="wp__label">Chat ID</span>
        <span class="wp__val wp__mono">{{ userStore.message?.telegramId || '未配置' }}</span>
      </div>
    </section>

    <section class="wp__sec">
      <h3 class="wp__h">投注账号</h3>
      <AccountBar embedded />
    </section>

    <section class="wp__sec">
      <h3 class="wp__h">用户配置</h3>
      <div class="cfg">
        <div class="cfg__grid">
          <!-- 基本配置 -->
          <div class="cfg__box">
            <div class="cfg__title">基本配置</div>
            <div class="cfg__row"><span class="cfg__k">下注金额</span><span class="cfg__v">{{ form.betMoney }}</span></div>
            <div class="cfg__row"><span class="cfg__k">尾数随机</span><span class="cfg__v">{{ form.tenNumber ? '开' : '关' }}</span></div>
            <div class="cfg__row"><span class="cfg__k">最小金额</span><span class="cfg__v">{{ form.minMoney }}</span></div>
            <div class="cfg__row"><span class="cfg__k">最大金额</span><span class="cfg__v">{{ form.maxMoney }}</span></div>
            <div class="cfg__row"><span class="cfg__k">投注次数</span><span class="cfg__v">{{ form.betCount }}</span></div>
            <div class="cfg__row"><span class="cfg__k">间隔(s)</span><span class="cfg__v">{{ form.betInterval }}</span></div>
            <div class="cfg__row"><span class="cfg__k">利润区间</span><span class="cfg__v">{{ form.profit }} ~ {{ form.maxProfit }}</span></div>
            <div class="cfg__row"><span class="cfg__k">最小赔率</span><span class="cfg__v">{{ form.minOdds }}</span></div>
            <div class="cfg__row"><span class="cfg__k">检测超时</span><span class="cfg__v">{{ form.checkTimeout }}ms</span></div>
          </div>

          <!-- 补单配置 -->
          <div class="cfg__box">
            <div class="cfg__title">补单配置</div>
            <div class="cfg__row"><span class="cfg__k">是否补单</span><span class="cfg__v" :class="form.makeUp ? 'on' : 'off'">{{ form.makeUp ? '开' : '关' }}</span></div>
            <div class="cfg__row"><span class="cfg__k">补单利润</span><span class="cfg__v">{{ form.makeProfit }}</span></div>
            <div class="cfg__row"><span class="cfg__k">初始赔率</span><span class="cfg__v">{{ form.makeUp_defaultOdds }}</span></div>
            <div class="cfg__row"><span class="cfg__k">当前赔率</span><span class="cfg__v">{{ form.makeUp_odds }}</span></div>
            <div class="cfg__row"><span class="cfg__k">不补同馆</span><span class="cfg__v">{{ form.noSameProvider ? '开' : '关' }}</span></div>
            <div class="cfg__row"><span class="cfg__k">不同场下注</span><span class="cfg__v">{{ form.noSameBet ? '开' : '关' }}</span></div>
            <div class="cfg__row"><span class="cfg__k">任意赔率</span><span class="cfg__v">{{ form.anyOdds ? '开' : '关' }}{{ form.anyOdds ? ` (${form.anyOddsProfit})` : '' }}</span></div>
          </div>

          <!-- 排序 & 策略 -->
          <div class="cfg__box">
            <div class="cfg__title">排序策略</div>
            <div class="cfg__row"><span class="cfg__k">下注排序</span><span class="cfg__v">{{ sortingLabel }}</span></div>
            <div v-if="form.betSorting === 'WinRate'" class="cfg__row"><span class="cfg__k">胜率阈值</span><span class="cfg__v">{{ form.winRateValue }}</span></div>
            <div class="cfg__row"><span class="cfg__k">平台顺序</span></div>
            <div class="cfg__tags">
              <span v-for="p in form.providerSortValue" :key="p" class="cfg__tag">{{ p }}</span>
            </div>
            <div v-if="form.providerFixed.length" class="cfg__row"><span class="cfg__k">固定平台</span></div>
            <div v-if="form.providerFixed.length" class="cfg__tags">
              <span v-for="p in form.providerFixed" :key="p" class="cfg__tag cfg__tag--fixed">{{ p }}</span>
            </div>
          </div>

          <!-- 拒单检测 -->
          <div class="cfg__box">
            <div class="cfg__title">拒单检测</div>
            <template v-for="pair in platformPairs" :key="pair.join('-')">
              <div class="cfg__wait-row">
                <div v-for="p in pair" :key="p" class="cfg__wait-item">
                  <span class="cfg__wait-plat">{{ p }}</span>
                  <span class="cfg__wait-val">{{ form.waitTime[p] ?? 0 }}</span>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.wp { min-height: 400px; padding: 8px 0; }
.wp__sec { margin-bottom: 20px; }
.wp__h { margin: 0 0 8px 4px; font-size: 14px; font-weight: 600; color: var(--adm-text, #e2e8f0); }
.wp__row { display: flex; align-items: center; gap: 12px; padding: 4px 8px; font-size: 13px; }
.wp__label { color: var(--adm-text-muted, #94a3b8); min-width: 60px; }
.wp__val { color: var(--adm-text, #e2e8f0); }
.wp__mono { font-family: monospace; }

/* 配置面板 */
.cfg__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}
.cfg__box {
  border: 1px solid var(--adm-border, rgba(255,255,255,0.1));
  border-radius: 6px;
  padding: 10px 12px;
  margin: 0;
}
.cfg__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--adm-text, #e2e8f0);
  padding: 0 0 6px;
  margin-bottom: 4px;
  border-bottom: 1px solid var(--adm-border, rgba(255,255,255,0.1));
}
.cfg__row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 3px 0;
  font-size: 12px;
  line-height: 1.6;
}
.cfg__k {
  color: var(--adm-text-muted, #94a3b8);
  min-width: 70px;
  flex-shrink: 0;
}
.cfg__v {
  color: var(--adm-text, #e2e8f0);
  font-variant-numeric: tabular-nums;
}
.cfg__v.on { color: var(--adm-success, #67c23a); }
.cfg__v.off { color: var(--adm-text-muted, #64748b); }

/* 标签 */
.cfg__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 2px 0 4px;
}
.cfg__tag {
  padding: 2px 8px;
  border: 1px solid var(--adm-border, rgba(255,255,255,0.1));
  border-radius: 3px;
  font-size: 11px;
  color: var(--adm-text, #e2e8f0);
  background: rgba(255,255,255,0.04);
}
.cfg__tag--fixed {
  border-color: var(--adm-accent, #409eff);
  color: var(--adm-accent, #409eff);
}

/* 拒单检测 */
.cfg__wait-row {
  display: flex;
  gap: 8px;
  padding: 2px 0;
}
.cfg__wait-item {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  font-size: 12px;
}
.cfg__wait-plat {
  color: var(--adm-text-muted, #94a3b8);
  min-width: 36px;
}
.cfg__wait-val {
  color: var(--adm-text, #e2e8f0);
  font-variant-numeric: tabular-nums;
}
</style>
