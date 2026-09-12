/**
 * 把一张过门槛的跟单票打上 AutoYabo 决策：副盘、该档 NVP、EV 上下限。
 */
import type { PodBookLine } from "@/runtime/podAlerts";
import type { PodBetSettings } from "@/runtime/podBetSettings";
import type { PodBetTicket } from "@/runtime/podBetTicket";
import type { PodBoardFixture } from "@/runtime/podFixtureMatch";
import type {
  PodLiveOddsReader,
  PodMarketMatch,
  PodObQuoteCompare,
} from "@/runtime/podMarketMatch";
import { maxObOddsFromNvp, minObOddsFromNvp, podYaboEdgePct } from "./ev";
import { matchPodYaboMarket } from "./match";
import { comparePodYaboQuote } from "./quote";

export type PodYaboScoreContext = {
  fixture?: Pick<PodBoardFixture, "markets"> | null;
  swapped?: boolean;
  live?: PodLiveOddsReader;
  books?: PodBookLine[];
  settings: Pick<PodBetSettings, "minObEdgePct" | "spreadObEdgePct" | "maxObEdgePct" | "lineMatch">;
};

export type PodYaboFollowScore = PodBetTicket & {
  marketMatch: PodMarketMatch;
  obQuote: PodObQuoteCompare;
};

export function scorePodYaboFollow(ticket: PodBetTicket, ctx: PodYaboScoreContext): PodYaboFollowScore {
  const marketMatch = matchPodYaboMarket(
    ticket.alert,
    ctx.fixture,
    ctx.swapped === true,
    ctx.live,
    {
      books: ctx.books,
      loose: ctx.settings.lineMatch === "loose",
    },
  );
  const nvp = marketMatch.nvp > 1 ? marketMatch.nvp : ticket.nvp;
  const minObOdds = minObOddsFromNvp(nvp, podYaboEdgePct(ticket.alert, ctx.settings));
  const maxObOdds = maxObOddsFromNvp(nvp, ctx.settings.maxObEdgePct);
  return {
    ...ticket,
    nvp,
    minObOdds,
    maxObOdds,
    marketMatch,
    obQuote: comparePodYaboQuote(marketMatch, minObOdds, { maxObOdds, nvp }),
  };
}
