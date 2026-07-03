import type { AdminUserRow } from "@/types/admin";
import type { OrderRow } from "@/types/order";
import type { UserConfig } from "@/types/userConfig";
import { getAdminOrdersAll } from "@/api/admin";
import { adminAccountToPlatformAccount } from "@/components/admin/adminAccountDisplay";
import { PlatformAccount } from "@/models/platformAccount";
import { adminOrderToOrderRow } from "@/shared/adminOrderDisplay";
import { todayKey } from "@/shared/dateKey";
import { groupOrdersByLink } from "@/shared/orderLink";
import { useAccountStore } from "@/stores/accountStore";
import { useConfigStore } from "@/stores/configStore";
import { useOrderStore } from "@/stores/orderStore";
import { mergeUserConfig } from "@/types/userConfig";

interface WorkspaceSnapshot {
  accounts: PlatformAccount[];
  accountLoaded: boolean;
  editDialogOpen: boolean;
  editDialogAccount?: PlatformAccount;
  config: UserConfig;
  configLoaded: boolean;
  orders: Map<number, OrderRow[]>;
  orderDate: string;
  filterAccountId: number;
}

function cloneAccounts(accounts: PlatformAccount[]): PlatformAccount[] {
  return accounts.map(
    acc =>
      new PlatformAccount({
        accountId: acc.accountId,
        platformId: acc.platformId,
        platformName: acc.platformName,
        playerName: acc.playerName,
        provider: acc.provider,
        proxyId: acc.proxyId,
        gateway: acc.gateway,
        token: acc.token,
        referer: acc.referer,
        userAgent: acc.userAgent,
        cookie: acc.cookie,
        balance: acc.balance,
        credit: acc.credit,
        currency: acc.currency,
        updateTime: acc.updateTime,
        active: acc.active,
        today: acc.today,
        orderCount: acc.orderCount,
        unsettle: acc.unsettle,
        maxBalance: acc.maxBalance,
        minOdds: acc.minOdds,
        maxOdds: acc.maxOdds,
        minDefault: acc.minDefault,
        maxDefault: acc.maxDefault,
        totalProfit: acc.totalProfit,
        maxProfit: acc.maxProfit,
        maxOrder: acc.maxOrder,
        todayOrder: acc.todayOrder,
        pause: acc.pause,
        markupOnly: acc.markupOnly,
        noMarkup: acc.noMarkup,
        workTimes: acc.workTimes,
        winBalance: acc.winBalance,
        maxWinBalance: acc.maxWinBalance,
        profit: acc.profit,
        maxBetCount: acc.maxBetCount,
        multiply: acc.multiply,
        game: acc.game,
        rateConfig: acc.rateConfig,
        description: acc.description,
        realName: acc.realName,
        mobile: acc.mobile,
      }),
  );
}

/** 管理端详情：拉取指定用户订单并写入 orderStore（供 OrderView 展示） */
export async function loadEmbeddedUserOrders(userId: string, date: string) {
  const orderStore = useOrderStore();
  const accountStore = useAccountStore();
  const page = await getAdminOrdersAll({ userId, date });
  const list = (page.list ?? []).map(row => adminOrderToOrderRow(row, accountStore.accounts));
  orderStore.orders = groupOrdersByLink(list);
  orderStore.orderDate = date || page.date || todayKey();
  orderStore.updateTodayProfit(list);
}

/** 将 AdminUserRow 注入 Pinia（同步），返回恢复函数；订单由 loadEmbeddedUserOrders 异步拉取 */
let activeRestore: (() => void) | null = null;

export function unmountAdminUserWorkspace() {
  activeRestore?.();
  activeRestore = null;
}

export function mountAdminUserWorkspace(user: AdminUserRow): void {
  unmountAdminUserWorkspace();

  const accountStore = useAccountStore();
  const configStore = useConfigStore();
  const orderStore = useOrderStore();

  accountStore.stopBalanceRefreshLoop();

  const snap: WorkspaceSnapshot = {
    accounts: cloneAccounts(accountStore.accounts),
    accountLoaded: accountStore.loaded,
    editDialogOpen: accountStore.editDialogOpen,
    editDialogAccount: accountStore.editDialogAccount,
    config: toRawConfig(configStore.config),
    configLoaded: configStore.loaded,
    orders: new Map(orderStore.orders),
    orderDate: orderStore.orderDate,
    filterAccountId: orderStore.filterAccountId,
  };

  accountStore.$patch({
    accounts: (user.accounts ?? []).map(adminAccountToPlatformAccount),
    loaded: true,
    editDialogOpen: false,
    editDialogAccount: undefined,
    adminWorkspacePreview: true,
  });

  configStore.$patch({
    config: mergeUserConfig(user.setting as Partial<UserConfig>),
    loaded: true,
  });

  orderStore.orders = new Map();
  orderStore.filterAccountId = 0;

  activeRestore = () => {
    accountStore.$patch({
      accounts: snap.accounts,
      loaded: snap.accountLoaded,
      editDialogOpen: snap.editDialogOpen,
      editDialogAccount: snap.editDialogAccount,
      adminWorkspacePreview: false,
    });
    configStore.$patch({
      config: snap.config,
      loaded: snap.configLoaded,
    });
    orderStore.orders = snap.orders;
    orderStore.orderDate = snap.orderDate;
    orderStore.filterAccountId = snap.filterAccountId;
  };
}

function toRawConfig(config: UserConfig): UserConfig {
  try {
    return structuredClone(config);
  }
  catch {
    return mergeUserConfig(config);
  }
}
