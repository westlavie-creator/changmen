/**
 * 本机 PM 钱包会话：解锁后内存持钥；logout / 关页清空
 */

import { reactive, ref } from "vue";
import {
  base64ToBytes,
  bytesToBase64,
  createVerifier,
  decryptUtf8,
  deriveKek,
  encryptUtf8,
  randomBytes,
  verifyKek,
} from "./crypto";
import {
  defaultMetaIterations,
  defaultMetaVersion,
  getVaultKey,
  getVaultMeta,
  hasVault,
  listVaultKeys,
  putVaultKey,
  putVaultMeta,
  replaceVaultPasswordAtomic,
  vaultKeyId,
  type PmVaultMetaRecord,
} from "./store";

export interface PmVaultUiState {
  /** 需要弹出解锁框 */
  needUnlock: boolean;
  /** 需要首次设密 */
  needSetup: boolean;
  userId: string;
  busy: boolean;
  error: string;
}

export const pmVaultUi = reactive<PmVaultUiState>({
  needUnlock: false,
  needSetup: false,
  userId: "",
  busy: false,
  error: "",
});

type UnlockWaiter = {
  resolve: (ok: boolean) => void;
};

let unlockWaiter: UnlockWaiter | null = null;
let setupWaiter: UnlockWaiter | null = null;
/** 并发 ensureUnlock 共用同一个 Promise，避免 waiter 被覆盖 */
let unlockInFlight: Promise<boolean> | null = null;
let setupInFlight: Promise<boolean> | null = null;
/** lock 递增；异步 unlock/setup 完成后若 epoch 已变则丢弃 session */
let sessionEpoch = 0;

interface SessionState {
  userId: string;
  kek: CryptoKey;
  plainByAccountId: Map<number, string>;
  unlockedAt: number;
}

let session: SessionState | null = null;

/** 供 Vue 订阅 session 变更（session 本身非响应式） */
export const pmVaultSessionRev = ref(0);

function notifyPmVaultSessionChanged(): void {
  pmVaultSessionRev.value += 1;
  void import("./accountUiStatus").then((m) => {
    m.touchPmVaultAccountUiSession(session?.userId);
    void m.refreshPmVaultAccountUiFromStore();
  });
}

/** 规范化 vault 用的 userId；未登录返回空串 */
export function normalizePmVaultUserId(userId: unknown): string {
  if (userId == null)
    return "";
  const s = String(userId).trim();
  if (!s || s === "0")
    return "";
  return s;
}

export function isPmVaultUnlocked(userId?: string): boolean {
  if (!session)
    return false;
  if (userId != null && session.userId !== String(userId))
    return false;
  return true;
}

export function getPmVaultSessionUserId(): string | null {
  return session?.userId ?? null;
}

export function lockPmVault(): void {
  sessionEpoch += 1;
  session = null;
  pmVaultUi.needUnlock = false;
  pmVaultUi.needSetup = false;
  pmVaultUi.error = "";
  pmVaultUi.busy = false;
  unlockInFlight = null;
  setupInFlight = null;
  if (unlockWaiter) {
    unlockWaiter.resolve(false);
    unlockWaiter = null;
  }
  if (setupWaiter) {
    setupWaiter.resolve(false);
    setupWaiter = null;
  }
  notifyPmVaultSessionChanged();
}

export function getCachedPrivateKey(accountId: number): string | undefined {
  return session?.plainByAccountId.get(Number(accountId));
}

async function loadAllKeysIntoSession(kek: CryptoKey, userId: string): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  const rows = await listVaultKeys(userId);
  for (const row of rows) {
    try {
      const pk = await decryptUtf8(kek, row.cipher);
      map.set(Number(row.accountId), pk);
    }
    catch {
      /* skip corrupt entry */
    }
  }
  return map;
}

export async function setupPmVault(userId: string, password: string): Promise<void> {
  const uid = normalizePmVaultUserId(userId);
  if (!uid)
    throw new Error("缺少 userId");
  if (password.length < 8)
    throw new Error("本机钱包密码至少 8 位");
  if (await hasVault(uid))
    throw new Error("本机钱包已存在，请解锁而非重新设置");

  const epoch = sessionEpoch;
  const salt = randomBytes(16);
  const kek = await deriveKek(password, salt, defaultMetaIterations());
  if (epoch !== sessionEpoch)
    throw new Error("本机钱包已锁定");
  const verifier = await createVerifier(kek);
  const now = Date.now();
  const meta: PmVaultMetaRecord = {
    userId: uid,
    version: defaultMetaVersion(),
    saltB64: bytesToBase64(salt),
    kdf: "PBKDF2",
    iterations: defaultMetaIterations(),
    hash: "SHA-256",
    verifier,
    createdAt: now,
    updatedAt: now,
  };
  await putVaultMeta(meta);
  if (epoch !== sessionEpoch)
    throw new Error("本机钱包已锁定");
  session = {
    userId: uid,
    kek,
    plainByAccountId: new Map(),
    unlockedAt: now,
  };
  notifyPmVaultSessionChanged();
}

export async function unlockPmVault(userId: string, password: string): Promise<void> {
  const uid = normalizePmVaultUserId(userId);
  const epoch = sessionEpoch;
  const meta = await getVaultMeta(uid);
  if (!meta)
    throw new Error("本机尚未设置钱包密码");
  const saltBytes = base64ToBytes(meta.saltB64);
  const kek = await deriveKek(password, saltBytes, meta.iterations || defaultMetaIterations());
  if (epoch !== sessionEpoch)
    throw new Error("本机钱包已锁定");
  const ok = await verifyKek(kek, meta.verifier);
  if (!ok)
    throw new Error("本机钱包密码错误");
  const plain = await loadAllKeysIntoSession(kek, uid);
  if (epoch !== sessionEpoch)
    throw new Error("本机钱包已锁定");
  session = {
    userId: uid,
    kek,
    plainByAccountId: plain,
    unlockedAt: Date.now(),
  };
  notifyPmVaultSessionChanged();
}

export async function changePmVaultPassword(
  userId: string,
  oldPassword: string,
  newPassword: string,
): Promise<void> {
  await unlockPmVault(userId, oldPassword);
  if (newPassword.length < 8)
    throw new Error("新密码至少 8 位");
  const uid = normalizePmVaultUserId(userId);
  // 必须在任意后续 await 前快照：lock 竞态下 session 可能被清空
  if (!session || session.userId !== uid)
    throw new Error("本机钱包已锁定");
  const epoch = sessionEpoch;
  const entries = [...session.plainByAccountId.entries()];
  const existingBefore = await listVaultKeys(uid);
  if (epoch !== sessionEpoch)
    throw new Error("本机钱包已锁定");
  // 仓里本有钥，却读到空明文 → 说明解锁后被 lock，禁止用空列表覆盖
  if (existingBefore.length > 0 && entries.length === 0)
    throw new Error("本机钱包已锁定，改密已取消");
  const createdAt = (await getVaultMeta(uid))?.createdAt ?? Date.now();
  if (epoch !== sessionEpoch)
    throw new Error("本机钱包已锁定");
  const salt = randomBytes(16);
  const kek = await deriveKek(newPassword, salt, defaultMetaIterations());
  if (epoch !== sessionEpoch)
    throw new Error("本机钱包已锁定");
  const verifier = await createVerifier(kek);
  const now = Date.now();
  const keyRecords = [];
  for (const [accountId, pk] of entries) {
    const cipher = await encryptUtf8(kek, pk);
    keyRecords.push({
      id: vaultKeyId(uid, accountId),
      userId: uid,
      accountId,
      cipher,
      updatedAt: now,
    });
  }
  if (epoch !== sessionEpoch)
    throw new Error("本机钱包已锁定");
  if (existingBefore.length > 0 && keyRecords.length === 0)
    throw new Error("本机钱包已锁定，改密已取消");
  await replaceVaultPasswordAtomic({
    userId: uid,
    version: defaultMetaVersion(),
    saltB64: bytesToBase64(salt),
    kdf: "PBKDF2",
    iterations: defaultMetaIterations(),
    hash: "SHA-256",
    verifier,
    createdAt,
    updatedAt: now,
  }, keyRecords);
  if (epoch !== sessionEpoch)
    throw new Error("本机钱包已锁定");
  session = {
    userId: uid,
    kek,
    plainByAccountId: new Map(entries),
    unlockedAt: now,
  };
  notifyPmVaultSessionChanged();
}

export async function putPrivateKeyInVault(
  userId: string,
  accountId: number,
  privateKey: string,
  walletAddress?: string,
): Promise<void> {
  const uid = normalizePmVaultUserId(userId);
  if (!session || session.userId !== uid)
    throw new Error("请先解锁本机钱包");
  const pk = privateKey.trim();
  if (!pk)
    throw new Error("私钥为空");
  const id = Number(accountId);
  if (!id)
    throw new Error("缺少 accountId");
  const cipher = await encryptUtf8(session.kek, pk);
  await putVaultKey({
    id: vaultKeyId(uid, id),
    userId: uid,
    accountId: id,
    walletAddress: walletAddress?.trim() || undefined,
    cipher,
    updatedAt: Date.now(),
  });
  session.plainByAccountId.set(id, pk);
  notifyPmVaultSessionChanged();
}

export async function vaultHasKey(userId: string, accountId: number): Promise<boolean> {
  const uid = normalizePmVaultUserId(userId);
  if (session?.userId === uid && session.plainByAccountId.has(Number(accountId)))
    return true;
  return Boolean(await getVaultKey(uid, accountId));
}

/**
 * 需要解锁时弹出 UI；无 vault 则直接 true（尚无私钥仓）。
 * 用户取消解锁返回 false。
 */
export async function ensurePmVaultUnlocked(userId: string): Promise<boolean> {
  const uid = normalizePmVaultUserId(userId);
  if (!uid)
    return true;
  if (isPmVaultUnlocked(uid))
    return true;
  if (!(await hasVault(uid)))
    return true;
  if (unlockInFlight)
    return unlockInFlight;
  pmVaultUi.userId = uid;
  pmVaultUi.error = "";
  pmVaultUi.needUnlock = true;
  unlockInFlight = new Promise<boolean>((resolve) => {
    unlockWaiter = {
      resolve: (ok) => {
        unlockInFlight = null;
        resolve(ok);
      },
    };
  });
  return unlockInFlight;
}

/** 首次设密：弹出设密框，成功后 session 已解锁 */
export async function ensurePmVaultSetup(userId: string): Promise<boolean> {
  const uid = normalizePmVaultUserId(userId);
  if (!uid)
    return false;
  if (await hasVault(uid))
    return ensurePmVaultUnlocked(uid);
  if (isPmVaultUnlocked(uid))
    return true;
  if (setupInFlight)
    return setupInFlight;
  pmVaultUi.userId = uid;
  pmVaultUi.error = "";
  pmVaultUi.needSetup = true;
  setupInFlight = new Promise<boolean>((resolve) => {
    setupWaiter = {
      resolve: (ok) => {
        setupInFlight = null;
        resolve(ok);
      },
    };
  });
  return setupInFlight;
}

/** 解锁成功后把本机钥合并进账号内存（供自动下注） */
export async function syncUnlockedKeysIntoAccountStore(): Promise<void> {
  const uid = session?.userId;
  if (!uid)
    return;
  try {
    const { useAccountStore } = await import("@/stores/accountStore");
    const { mergeVaultKeysIntoAccounts, migrateTokenPrivateKeysToVault } = await import("./accounts");
    const store = useAccountStore();
    if (!store.accounts.length)
      return;
    mergeVaultKeysIntoAccounts(store.accounts, uid);
    const migrated = await migrateTokenPrivateKeysToVault(store.accounts, uid);
    if (migrated > 0)
      void store.saveAccounts();
  }
  catch {
    /* store 未就绪时忽略 */
  }
}

export function completePmVaultUnlock(ok: boolean): void {
  // 忙碌中拒绝取消，防止 KDF 完成后 session 已解锁却被判失败
  if (!ok && pmVaultUi.busy)
    return;
  pmVaultUi.needUnlock = false;
  pmVaultUi.error = "";
  const w = unlockWaiter;
  unlockWaiter = null;
  const success = ok && isPmVaultUnlocked(pmVaultUi.userId);
  if (success)
    void syncUnlockedKeysIntoAccountStore();
  pmVaultSessionRev.value += 1;
  void import("./accountUiStatus").then(m => m.refreshPmVaultAccountUiFromStore());
  w?.resolve(success);
}

export function completePmVaultSetup(ok: boolean): void {
  if (!ok && pmVaultUi.busy)
    return;
  pmVaultUi.needSetup = false;
  pmVaultUi.error = "";
  const w = setupWaiter;
  setupWaiter = null;
  const success = ok && isPmVaultUnlocked(pmVaultUi.userId);
  if (success)
    void syncUnlockedKeysIntoAccountStore();
  pmVaultSessionRev.value += 1;
  void import("./accountUiStatus").then(m => m.refreshPmVaultAccountUiFromStore());
  w?.resolve(success);
}

export { hasVault };
