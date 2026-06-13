export declare const PB_MULTIPLY_DEFAULT: 10;
export declare const DEFAULT_MULTIPLY: 1;

export declare function isPbProvider(provider: unknown): boolean;
export declare function resolveAccountMultiply(provider: unknown, rawMultiply: unknown): number;
export declare function accountProviderKey(row: unknown): string;
export declare function normalizeAccountMultiplyField<T>(row: T): T;
export declare function normalizeAccountList(accounts: unknown): unknown[];
export declare function accountsMultiplyNeedsPersist(
  before: unknown[],
  after: unknown[],
): boolean;
