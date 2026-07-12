export const CHANGMEN_LAYOUT: {
  readonly venueAdapter: string;
  readonly clientWeb: string;
  readonly clientChromeExtension: string;
  readonly platformProbes: string;
  readonly packages: string;
  readonly serverBackend: string;
  readonly serverMatcher: string;
  readonly serverDb: string;
  readonly serverCollectors: string;
  readonly lines: string;
  readonly baseball: string;
};

export const VENUE_ADAPTER_REL: string;
export const VENUE_ADAPTER_ROOT: string;
export const CLIENT_WEB_ROOT: string;
export const PLATFORM_PROBES_ROOT: string;

export function changmenPath(...relSegments: string[]): string;

export const CHANGMEN_ROOT: string;
export const BACKEND_ROOT: string;
export const STORAGE_DIR: string;
export const ESPORT_DATA_DIR: string;

export function ensureStoragePaths(): void;

export function findChangmenRoot(fromDir: string): string;
