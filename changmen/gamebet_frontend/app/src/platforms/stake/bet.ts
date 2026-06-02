import { BetResult } from "@/models/betResult";
import type { PlatformAccount } from "@/models/platformAccount";
const STAKE_USDT_TO_CNY = 6.977023058793687;
import { stakeAccountHeaders, stakePluginGraphql } from "./pluginApi";
import { getStakeTabIdCached, stakeTabIdHint, waitForStakeTabId } from "./tabId";
import type { PlatformProvider, VenueOrder, VenueOrderStatus } from "@/platforms/contract";
import type { LimitEntry } from "@/types/limit";
import { PLATFORMS } from "@/shared/platform";
import { toFixed } from "@/shared/format";
import { useOddsStore } from "@/stores/oddsStore";

const BET_THROTTLE_MS = 30_000;
const lastBetAtByMarket = new Map<string, number>();

const USER_BALANCES_QUERY = `query UserBalances {
  user {
    id
    balances {
      available {
        amount
        currency
        __typename
      }
      vault {
        amount
        currency
        __typename
      }
      __typename
    }
    __typename
  }
}`;

const UPDATE_PREFERENCE_MUTATION = `mutation UpdateUserBettingPreference($preference: UpdateUserPreferencePreferenceInput!) {
  updateUserPreference(preference: $preference) {
    id
    preference {
      noBetConfirmation
      oddsChangeCondition
      singleBetSlipDisplayFirst
    }
    __typename
  }
}`;

const CHECK_BET_QUERY = `query SportBet_SportMarketOutcome($outcomeId: String!, $provider: SportsbookOddsProviderEnum!) {
  sportMarketOutcome(outcomeId: $outcomeId, provider: $provider) {
    id
    name
    odds
    market {
      id
      name
      status
      provider
      fixture {
        id
        slug
        status
        tournament {
          slug
          category {
            slug
            sport {
              slug
            }
          }
        }
        data {
          __typename
          ... on SportFixtureDataMatch {
            startTime
            competitors {
              name
            }
          }
          ... on SportFixtureDataOutright {
            startTime
            name
          }
        }
      }
    }
  }
}`;

const PLACE_BET_MUTATION = `mutation BetSlipFooter_SportBet($amount: Float!, $currency: CurrencyEnum!, $outcomeIds: [String!]!, $oddsChange: SportOddsChangeEnum!, $identifier: String, $betType: SportBetTypeEnum!, $stakeShieldEnabled: Boolean, $stakeShieldProtectionLevel: Int, $stakeShieldOfferOdds: Float) {
  sportBet(
    amount: $amount
    currency: $currency
    outcomeIds: $outcomeIds
    oddsChange: $oddsChange
    identifier: $identifier
    betType: $betType
    stakeShieldEnabled: $stakeShieldEnabled
    stakeShieldProtectionLevel: $stakeShieldProtectionLevel
    stakeShieldOfferOdds: $stakeShieldOfferOdds
  ) {
    id
    amount
    currency
    payoutMultiplier
    potentialMultiplier
    outcomes {
      id
      odds
    }
  }
}`;

const ACTIVE_BETS_QUERY = `query ActiveBets_User(
    $limit: Int!
    $sort: UserBetsSortEnum
    $name: String
    $offset: Int!
) {
    user(name: $name) {
        id
        activeSportBets(limit: $limit, sort: $sort, offset: $offset) {
            id
            status
            amount
            currency
            payout
            potentialMultiplier
            payoutMultiplier
            createdAt
            outcomes {
                odds
                outcome {
                    name
                }
                market {
                    name
                }
                fixture {
                    id
                    name
                    tournament {
                        category {
                            sport {
                                slug
                            }
                        }
                    }
                }
            }
        }
    }
}`;

const SPORT_BET_LIST_QUERY = `query SportSportList(
    $limit: Int!
    $offset: Int!
    $name: String
    $status: [SportBetStatusEnum!]
) {
    user(name: $name) {
        id
        name
        sportBetList(limit: $limit, offset: $offset, status: $status) {
            id
            iid
            bet {
                ... on SportBet {
                    id
                    status
                    amount
                    currency
                    payout
                    potentialMultiplier
                    payoutMultiplier
                    createdAt
                    outcomes {
                        odds
                        outcome {
                            name
                        }
                        market {
                            name
                        }
                        fixture {
                            id
                            name
                            tournament {
                                category {
                                    sport {
                                        slug
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}`;

function first<T>(arr: T[] | undefined | null): T | undefined {
  return arr?.[0];
}

/** 对齐 A8 `tJe` */
function mapStakeOrderStatus(
  status: string,
  amount: number,
  payout: number,
): VenueOrderStatus {
  switch (status) {
    case "confirmed":
    case "settledpending":
    case "cashoutpending":
      return "none";
    case "pending":
      return "pending";
    case "cancelpending":
      return "reject";
    case "settled":
    case "cashout":
      if (payout > amount) return "win";
      if (payout < amount) return "lose";
      return "return";
    case "cancelled":
      return "return";
    default:
      return "none";
  }
}

/** 对齐 A8 `t$` */
function mapStakeOrderRow(bet: Record<string, unknown>): VenueOrder {
  const amount = Number(bet.amount) || 0;
  const payout = Number(bet.payout) || 0;
  const status = mapStakeOrderStatus(String(bet.status ?? ""), amount, payout);
  let money = 0;
  if (status === "win" || status === "lose") {
    money = (payout - amount) * STAKE_USDT_TO_CNY;
  }
  const outcomes = (bet.outcomes as Array<Record<string, unknown>> | undefined) ?? [];
  const o0 = first(outcomes);
  const outcome = (o0?.outcome as Record<string, unknown> | undefined) ?? {};
  const market = (o0?.market as Record<string, unknown> | undefined) ?? {};
  const fixture = (o0?.fixture as Record<string, unknown> | undefined) ?? {};
  const tournament = (fixture.tournament as Record<string, unknown> | undefined) ?? {};
  const category = (tournament.category as Record<string, unknown> | undefined) ?? {};
  const sport = (category.sport as Record<string, unknown> | undefined) ?? {};

  return {
    provider: PLATFORMS.Stake,
    orderId: String(bet.id ?? ""),
    odds: Number(o0?.odds) || 0,
    createAt: new Date(String(bet.createdAt ?? Date.now())).getTime(),
    betMoney: amount * STAKE_USDT_TO_CNY,
    reward: payout * STAKE_USDT_TO_CNY,
    money,
    status,
    game: String(sport.slug ?? ""),
    match: String(fixture.name ?? ""),
    bet: String(market.name ?? ""),
    item: String(outcome.name ?? ""),
  };
}

function stakeLimitExceeded(limit: LimitEntry, betMoney: number): boolean {
  const value = Number(limit.value) || 0;
  if (limit.expireTime && limit.expireTime < Date.now()) return false;
  return betMoney > value;
}

async function resolveTabId(): Promise<number | undefined> {
  return getStakeTabIdCached() ?? (await waitForStakeTabId());
}

async function stakeGraphqlForAccount(
  account: PlatformAccount,
  label: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const tabId = await resolveTabId();
  if (!tabId) throw new Error(stakeTabIdHint());
  const headers = stakeAccountHeaders(account);
  if (!headers) throw new Error("token error");
  return stakePluginGraphql(label, body, { tabId, headers });
}

export const stakeProvider: PlatformProvider = {
  async getBalance(account) {
    const tabId = await resolveTabId();
    if (!tabId) throw new Error(stakeTabIdHint());

    const root = await stakeGraphqlForAccount(account, "getBalance", {
      query: USER_BALANCES_QUERY,
      operationName: "UserBalances",
    });
    const gql = (root.data as Record<string, unknown> | undefined) ?? {};
    const user = (gql.user as Record<string, unknown> | undefined) ?? {};
    const balances = (user.balances as Array<Record<string, unknown>> | undefined) ?? [];
    const usdt = balances.find((row) => {
      const available = row.available as Record<string, unknown> | undefined;
      return available?.currency === "usdt";
    });
    const available = (usdt?.available as Record<string, unknown> | undefined) ?? {};
    const amount = available.amount != null ? Number(available.amount) : undefined;
    const multiply = Math.max(1, account.multiply ?? 1);
    const balanceCny = amount !== undefined ? amount * STAKE_USDT_TO_CNY * multiply : undefined;

    await stakeGraphqlForAccount(account, "UpdateUserBettingPreference", {
      query: UPDATE_PREFERENCE_MUTATION,
      variables: {
        preference: {
          noBetConfirmation: false,
          singleBetSlipDisplayFirst: true,
          oddsChangeCondition: "higher",
        },
      },
    });

    return {
      currency: "CNY",
      balance: balanceCny ?? 0,
    };
  },

  async checkBet(account, option) {
    const tabId = await resolveTabId();
    if (!tabId) {
      option.checkError = stakeTabIdHint();
      return option;
    }

    const lastAt = lastBetAtByMarket.get(option.betId);
    if (lastAt && lastAt > Date.now() - BET_THROTTLE_MS) {
      const sec = Math.floor((Date.now() - lastAt) / 1000);
      option.checkError = `请稍等 30 秒后再重下同样的赌注，当前时间：${sec}秒`;
      return option;
    }

    const oddsStore = useOddsStore();
    const localLimit = oddsStore.getLimit(account.provider, option.itemId);
    if (localLimit && stakeLimitExceeded(localLimit, option.betMoney)) {
      option.checkError = `本地限红：${Number(localLimit.value).toFixed(2)}`;
      option.updateOdds(0);
      return option;
    }

    const root = await stakeGraphqlForAccount(account, "checkBet", {
      query: CHECK_BET_QUERY,
      variables: { outcomeId: option.itemId, provider: "oddin" },
    });
    option.response = root;
    const gql = (root.data as Record<string, unknown> | undefined) ?? {};

    const outcome = (gql.sportMarketOutcome as Record<string, unknown> | undefined) ?? {};
    const market = (outcome.market as Record<string, unknown> | undefined) ?? {};
    const marketInactive = market.status !== "active";
    const newOdds = marketInactive ? 0 : Number(outcome.odds) || 0;
    option.updateOdds(newOdds);

    if (!newOdds) {
      option.checkError = `${market.status ?? ""} @ ${Number(outcome.odds) || 0}`;
      return option;
    }
    if (option.odds > newOdds + 0.01) {
      option.checkError = `新赔率：${newOdds}`;
      return option;
    }

    const amountUsdt = Number(toFixed(option.betMoney / STAKE_USDT_TO_CNY, 8));
    option.data = {
      query: PLACE_BET_MUTATION,
      variables: {
        amount: amountUsdt,
        currency: "usdt",
        outcomeIds: [option.itemId],
        betType: "esports",
        oddsChange: "higher",
        stakeShieldOfferOdds: newOdds,
      },
    };
    return option;
  },

  async betting(account, option) {
    const tabId = await resolveTabId();
    if (!tabId) {
      return new BetResult(account.provider, false, stakeTabIdHint(), option.data);
    }

    const root = await stakeGraphqlForAccount(account, "betting", option.data as Record<string, unknown>);
    const errors = root.errors as Array<Record<string, unknown>> | undefined;
    if (errors?.length) {
      const err0 = errors[0]!;
      const message = String(err0.message ?? "下单失败");
      if (err0.errorType === "rejectedBetLimitExceededForBetReoffer") {
        const match = /[\d.]+$/.exec(message);
        if (match) {
          const maxUsdt = Number(match[0]);
          useOddsStore().setLimit(
            account.provider,
            option.itemId,
            Math.floor(maxUsdt * STAKE_USDT_TO_CNY),
            option.newOdds,
            60,
          );
        }
      } else if (err0.errorType === "insufficientBalance") {
        account.balance = undefined;
      }
      return new BetResult(account.provider, false, message, option.data, root);
    }

    const data = root.data as Record<string, unknown> | undefined;
    if (!data?.sportBet) {
      return new BetResult(account.provider, false, "未知错误", option.data, root);
    }

    const sportBet = data.sportBet as Record<string, unknown>;
    const outcomes = (sportBet.outcomes as Array<Record<string, unknown>> | undefined) ?? [];
    const o0 = first(outcomes);
    lastBetAtByMarket.set(option.betId, Date.now());

    const currency = String(sportBet.currency ?? "usdt").toUpperCase();
    const amount = sportBet.amount ?? "";
    const odds = o0?.odds ?? "";
    return new BetResult(
      account.provider,
      true,
      `投注成功，${currency}${amount}@${odds}`,
      option.data,
      root,
    );
  },

  async getOrders(account) {
    const tabId = await resolveTabId();
    if (!tabId) return [];

    const queries = [
      {
        query: ACTIVE_BETS_QUERY,
        variables: { limit: 50, offset: 0, sort: "placedTime" },
      },
      {
        query: SPORT_BET_LIST_QUERY,
        variables: {
          limit: 15,
          offset: 0,
          status: [
            "settled",
            "settledManual",
            "settledPending",
            "cancelPending",
            "cancelled",
            "cashout",
            "cashoutPending",
          ],
        },
      },
    ];

    const orders: VenueOrder[] = [];
    for (const body of queries) {
      const root = await stakeGraphqlForAccount(account, "getOrders", body);
      const gql = (root.data as Record<string, unknown> | undefined) ?? {};
      const user = (gql.user as Record<string, unknown> | undefined) ?? {};
      const active = (user.activeSportBets as Array<Record<string, unknown>> | undefined) ?? [];
      for (const row of active) orders.push(mapStakeOrderRow(row));

      const list = (user.sportBetList as Array<Record<string, unknown>> | undefined) ?? [];
      for (const row of list) {
        const bet = (row.bet as Record<string, unknown> | undefined) ?? {};
        orders.push(mapStakeOrderRow(bet));
      }
    }
    return orders;
  },
};
