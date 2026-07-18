const DB_NAME = "gamebet-order-sound";
const DB_VERSION = 2;

type StoreName = "blob" | "handle";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB 不可用"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("打开 IndexedDB 失败"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      if (!db.objectStoreNames.contains("blob"))
        db.createObjectStore("blob");
      if (!db.objectStoreNames.contains("handle"))
        db.createObjectStore("handle");
      if (ev.oldVersion > 0 && ev.oldVersion < 2 && db.objectStoreNames.contains("custom"))
        db.deleteObjectStore("custom");
    };
  });
}

export function customSoundRefForUser(userName: string) {
  return `custom:${String(userName || "anonymous").trim() || "anonymous"}`;
}

async function idbPut(store: StoreName, key: string, value: Blob | FileSystemFileHandle) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("写入失败"));
    tx.objectStore(store).put(value, key);
  });
  db.close();
}

async function idbGet<T>(store: StoreName, key: string): Promise<T | null> {
  const db = await openDb();
  const value = await new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(req.error ?? new Error("读取失败"));
  });
  db.close();
  return value;
}

async function idbDelete(store: StoreName, key: string) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("删除失败"));
    tx.objectStore(store).delete(key);
  });
  db.close();
}

export async function saveCustomOrderSoundBlob(userName: string, blob: Blob): Promise<string> {
  const ref = customSoundRefForUser(userName);
  await idbPut("blob", ref, blob);
  await idbDelete("handle", ref);
  return ref;
}

/** @deprecated 播放一律走 blob；仅保留供旧数据迁移内部使用 */
export async function saveCustomOrderSoundHandle(userName: string, handle: FileSystemFileHandle): Promise<string> {
  const ref = customSoundRefForUser(userName);
  await idbPut("handle", ref, handle);
  await idbDelete("blob", ref);
  return ref;
}

type FileHandleWithPermission = FileSystemFileHandle & {
  queryPermission?: (descriptor?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (descriptor?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
};

async function ensureHandleReadable(
  handle: FileHandleWithPermission,
  allowPermissionPrompt: boolean,
): Promise<boolean> {
  if (typeof handle.queryPermission !== "function")
    return true;
  let state = await handle.queryPermission({ mode: "read" });
  if (state === "granted")
    return true;
  if (!allowPermissionPrompt || typeof handle.requestPermission !== "function")
    return false;
  state = await handle.requestPermission({ mode: "read" });
  return state === "granted";
}

/**
 * 优先读 IndexedDB blob；若仅有旧版 FileSystemFileHandle，在可授权时拷成 blob 后返回。
 * 下单通知应 allowPermissionPrompt=false（无用户手势）；试听/设置页可 true。
 */
export async function loadCustomOrderSoundBlob(
  userName: string,
  opts: { allowPermissionPrompt?: boolean } | "blob" | "handle" = {},
): Promise<Blob | null> {
  // 兼容旧调用：loadCustomOrderSoundBlob(user, "blob" | "handle")
  const allowPermissionPrompt = typeof opts === "string"
    ? opts === "handle"
    : opts.allowPermissionPrompt === true;

  const ref = customSoundRefForUser(userName);
  const existing = await idbGet<Blob>("blob", ref);
  if (existing)
    return existing;

  const handle = await idbGet<FileHandleWithPermission>("handle", ref);
  if (!handle)
    return null;

  try {
    if (!(await ensureHandleReadable(handle, allowPermissionPrompt)))
      return null;
    const file = await handle.getFile();
    await saveCustomOrderSoundBlob(userName, file);
    return file;
  }
  catch {
    return null;
  }
}

/** 设置页：尝试把旧 handle 迁成 blob；成功返回文件名 */
export async function migrateCustomOrderSoundHandleToBlob(
  userName: string,
  opts: { allowPermissionPrompt?: boolean } = {},
): Promise<{ ok: boolean; fileName?: string }> {
  const ref = customSoundRefForUser(userName);
  if (await idbGet<Blob>("blob", ref))
    return { ok: true };

  const handle = await idbGet<FileHandleWithPermission>("handle", ref);
  if (!handle)
    return { ok: false };

  const blob = await loadCustomOrderSoundBlob(userName, {
    allowPermissionPrompt: opts.allowPermissionPrompt === true,
  });
  if (!blob)
    return { ok: false };
  const fileName = blob instanceof File ? blob.name : undefined;
  return { ok: true, fileName };
}

export async function hasCustomOrderSoundBlob(userName: string): Promise<boolean> {
  const ref = customSoundRefForUser(userName);
  return (await idbGet<Blob>("blob", ref)) != null;
}

export async function deleteCustomOrderSound(userName: string) {
  const ref = customSoundRefForUser(userName);
  await Promise.all([
    idbDelete("blob", ref),
    idbDelete("handle", ref),
  ]);
}

export function isFileSystemAccessSupported() {
  return getShowOpenFilePicker() != null;
}

type AudioPickerType = {
  description: string;
  accept: Record<string, string[]>;
};

function getShowOpenFilePicker() {
  const w = window as Window & {
    showOpenFilePicker?: (options: {
      types: AudioPickerType[];
      multiple: boolean;
    }) => Promise<FileSystemFileHandle[]>;
  };
  return typeof w.showOpenFilePicker === "function" ? w.showOpenFilePicker.bind(w) : null;
}

const AUDIO_PICK_TYPES: AudioPickerType[] = [
  {
    description: "音频",
    accept: {
      "audio/*": [".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac"],
    },
  },
];

function isAudioFile(file: File) {
  if (file.type.startsWith("audio/"))
    return true;
  return /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(file.name);
}

/** 优先系统文件选择器（仅取 File）；不支持时返回 null，由调用方回退 input */
export async function pickCustomSoundViaFileSystemAccess(): Promise<{
  file: File;
  handle: FileSystemFileHandle;
} | null> {
  if (!isFileSystemAccessSupported())
    return null;
  try {
    const picker = getShowOpenFilePicker();
    if (!picker)
      return null;
    const [handle] = await picker({
      types: AUDIO_PICK_TYPES,
      multiple: false,
    });
    const file = await handle.getFile();
    if (!isAudioFile(file))
      throw new Error("请选择音频文件");
    return { file, handle };
  }
  catch (e) {
    if (e instanceof DOMException && e.name === "AbortError")
      return null;
    throw e;
  }
}

export { isAudioFile };
