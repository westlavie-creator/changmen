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

export async function saveCustomOrderSoundHandle(userName: string, handle: FileSystemFileHandle): Promise<string> {
  const ref = customSoundRefForUser(userName);
  await idbPut("handle", ref, handle);
  await idbDelete("blob", ref);
  return ref;
}

export async function loadCustomOrderSoundBlob(
  userName: string,
  source: "blob" | "handle",
): Promise<Blob | null> {
  const ref = customSoundRefForUser(userName);
  if (source === "handle") {
    const handle = await idbGet<FileSystemFileHandle>("handle", ref);
    if (!handle)
      return null;
    try {
      return await handle.getFile();
    }
    catch {
      return null;
    }
  }
  return idbGet<Blob>("blob", ref);
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

/** 优先系统文件选择器（可记住句柄）；不支持时返回 null，由调用方回退 input */
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
