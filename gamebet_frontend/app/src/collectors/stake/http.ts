import { directPostJson } from "@/shared/http";
import { STAKE_GRAPHQL } from "@/collectors/stake/core";

/** Stake GraphQL SportIndex 直连 */
export async function collectStakeGraphql<T>(
  apiUrl: string,
  accessToken: string,
  sportSlug: string,
): Promise<T> {
  const url = `${apiUrl.replace(/\/+$/, "")}/_api/graphql`;
  const headers = {
    "content-type": "application/json",
    "x-language": "zh",
    "x-access-token": accessToken,
    "x-operation-name": "SportIndex",
    "x-operation-type": "query",
  };
  return directPostJson<T>(
    url,
    headers,
    {
      query: STAKE_GRAPHQL,
      variables: { sport: sportSlug, groups: ["winner", "maps"] },
    },
  );
}
