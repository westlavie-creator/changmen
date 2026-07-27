/**
 * IndexedDB 持久化：PM 私钥密文仓
 */

import {
  type AesGcmBlob,
  PM_VAULT_KDF_ITERATIONS,
  PM_VAULT_VERSION,
} from "./crypto";

const DB_NAME = "changmen_pm_key_vault";
const DB_VERSION = 1;
const META_STORE = "meta";
const KEYS_STORE = "keys";

export interface PmVaultMetaRecord {
  userId: string;
  version: number;
  saltB64: string;
  kdf: "PBKDF2";
  iterations: number;
  hash: "SHA-256";
  verifier: AesGcmBlob;
  createdAt: number;
  updatedAt: number;
}

export interface PmVaultKeyRecord {
  id: string;
  userId: string;
  accountId: number;
  walletAddress?: string;
  cipher: AesGcmBlob;
  updatedAt: number;
}

export function vaultKeyId(userId: string, accountId: number): string {
  return `${userId}:${accountId}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("当前环境不支持 IndexedDB"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META_STORE))
        db.createObjectStore(META_STORE, { keyPath: "userId" });
      if (!db.objectStoreNames.contains(KEYS_STORE)) {
        const store = db.createObjectStore(KEYS_STORE, { keyPath: "id" });
        store.createIndex("userId", "userId", { unique: false });
      }
    };
  });
}

function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

export async function getVaultMeta(userId: string): Promise<PmVaultMetaRecord | undefined> {
  const db = await openDb();
  try {
    const tx = db.transaction(META_STORE, "readonly");
    return (await idbReq(tx.objectStore(META_STORE).get(userId))) as PmVaultMetaRecord | undefined;
  }
  finally {
    db.close();
  }
}

export async function hasVault(userId: string): Promise<boolean> {
  return Boolean(await getVaultMeta(userId));
}

export async function putVaultMeta(meta: PmVaultMetaRecord): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(META_STORE, "readwrite");
    await idbReq(tx.objectStore(META_STORE).put(meta));
  }
  finally {
    db.close();
  }
}

export async function listVaultKeys(userId: string): Promise<PmVaultKeyRecord[]> {
  const db = await openDb();
  try {
    const tx = db.transaction(KEYS_STORE, "readonly");
    const store = tx.objectStore(KEYS_STORE);
    const idx = store.index("userId");
    return (await idbReq(idx.getAll(userId))) as PmVaultKeyRecord[];
  }
  finally {
    db.close();
  }
}

export async function getVaultKey(
  userId: string,
  accountId: number,
): Promise<PmVaultKeyRecord | undefined> {
  const db = await openDb();
  try {
    const tx = db.transaction(KEYS_STORE, "readonly");
    return (await idbReq(tx.objectStore(KEYS_STORE).get(vaultKeyId(userId, accountId)))) as
      | PmVaultKeyRecord
      | undefined;
  }
  finally {
    db.close();
  }
}

export async function putVaultKey(rec: PmVaultKeyRecord): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(KEYS_STORE, "readwrite");
    await idbReq(tx.objectStore(KEYS_STORE).put(rec));
  }
  finally {
    db.close();
  }
}

/** 改密：meta + 全部 key 同一事务写入，避免写到一半不可恢复 */
export async function replaceVaultPasswordAtomic(
  meta: PmVaultMetaRecord,
  keys: PmVaultKeyRecord[],
): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction([META_STORE, KEYS_STORE], "readwrite");
    tx.objectStore(META_STORE).put(meta);
    const keyStore = tx.objectStore(KEYS_STORE);
    for (const rec of keys)
      keyStore.put(rec);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB replace password failed"));
      tx.onabort = () => reject(tx.error ?? new Error("IndexedDB replace password aborted"));
    });
  }
  finally {
    db.close();
  }
}

export async function deleteVaultKey(userId: string, accountId: number): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(KEYS_STORE, "readwrite");
    await idbReq(tx.objectStore(KEYS_STORE).delete(vaultKeyId(userId, accountId)));
  }
  finally {
    db.close();
  }
}

export function defaultMetaIterations(): number {
  return PM_VAULT_KDF_ITERATIONS;
}

export function defaultMetaVersion(): number {
  return PM_VAULT_VERSION;
}
