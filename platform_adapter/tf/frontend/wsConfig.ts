/** A8 `WBe` [A8 可证实]：TF 赔率 WS 经 A8 代理，不直连 TF gateway */
export const TF_A8_WS_HOST = "47.115.75.57";

export const TF_WS_PATH = "/esport/ws/TF";

export function buildTfDirectWsUrl(authToken: string): string {
  const auth = encodeURIComponent(authToken);
  return `wss://${TF_A8_WS_HOST}${TF_WS_PATH}?auth_token=${auth}&combo=false`;
}
