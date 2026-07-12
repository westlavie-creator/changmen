/** Electron loadExtension 与 MV3 service worker 均只可靠使用 local */

let areaPromise = null;
/** @type {'local'} */
let areaName = "local";

async function resolveStorageArea() {
  if (typeof chrome === "undefined" || !chrome.storage?.local) {
    throw new Error("chrome.storage unavailable");
  }
  return chrome.storage.local;
}

/** @returns {Promise<chrome.storage.StorageArea>} */
export function getStorageArea() {
  if (!areaPromise) areaPromise = resolveStorageArea();
  return areaPromise;
}

/** @returns {Promise<'local'>} */
export async function getStorageAreaName() {
  await getStorageArea();
  return areaName;
}

/**
 * @param {string | string[] | Record<string, unknown> | null} keys
 */
export async function storageGet(keys) {
  const area = await getStorageArea();
  return area.get(keys);
}

/**
 * @param {Record<string, unknown>} items
 */
export async function storageSet(items) {
  const area = await getStorageArea();
  return area.set(items);
}
