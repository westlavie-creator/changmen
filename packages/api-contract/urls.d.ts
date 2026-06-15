export declare const ESPORT_PATH_PREFIX: "/esport";
export declare const HTTP_RELAY_SUFFIX: string;

export declare function normalizeApiBase(base: string | null | undefined): string;
export declare function buildEsportPath(action: string, query?: string): string;
export declare function buildEsportUrl(
  action: string,
  query?: string,
  apiBase?: string | null | undefined,
): string;
export declare function buildHttpRelayUrl(opts?: {
  apiBase?: string;
  proxyOrigin?: string;
}): string;
