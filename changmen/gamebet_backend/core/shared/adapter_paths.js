"use strict";

const fs = require("fs");
const path = require("path");

/** gamebet_backend 根目录（本文件位于 core/shared/） */
const BACKEND_ROOT = path.join(__dirname, "..", "..");

let _adapterRoot;

/**
 * platform_adapter 根目录。
 * - 开发：changmen/platform_adapter（与 gamebet_backend 同级）
 * - Electron asar：gamebet_backend/platform_adapter（electron-builder 打入）
 */
function getAdapterRoot() {
  if (_adapterRoot) return _adapterRoot;

  const bundled = path.join(BACKEND_ROOT, "platform_adapter");
  if (fs.existsSync(path.join(bundled, "registry", "manifest.json"))) {
    _adapterRoot = bundled;
    return _adapterRoot;
  }

  const sibling = path.join(BACKEND_ROOT, "..", "platform_adapter");
  if (fs.existsSync(path.join(sibling, "registry", "manifest.json"))) {
    _adapterRoot = sibling;
    return _adapterRoot;
  }

  throw new Error(
    "platform_adapter not found: expected gamebet_backend/platform_adapter (packaged) or changmen/platform_adapter (dev)",
  );
}

/** require(platform_adapter 下的相对路径片段) */
function adapterRequire(...segments) {
  return require(path.join(getAdapterRoot(), ...segments));
}

let _registryPaths;

function getRegistryPaths() {
  if (!_registryPaths) {
    _registryPaths = adapterRequire("registry", "paths.js");
  }
  return _registryPaths;
}

function resolvePlatformFile(id, ...segments) {
  return getRegistryPaths().resolvePlatformFile(id, ...segments);
}

function resolveBackendFeedModule(id) {
  return getRegistryPaths().resolveBackendFeedModule(id);
}

function resolveBackendRelayModule(id) {
  return getRegistryPaths().resolveBackendRelayModule(id);
}

/** require(platform_adapter/{dir}/...) */
function requirePlatform(id, ...segments) {
  return require(resolvePlatformFile(id, ...segments));
}

function requirePlatformFeed(id) {
  return require(resolveBackendFeedModule(id));
}

function requirePlatformRelay(id) {
  const abs = resolveBackendRelayModule(id);
  if (!abs) throw new Error(`manifest has no backendRelay: ${id}`);
  return require(abs);
}

module.exports = {
  BACKEND_ROOT,
  getAdapterRoot,
  adapterRequire,
  getRegistryPaths,
  resolvePlatformFile,
  resolveBackendFeedModule,
  resolveBackendRelayModule,
  requirePlatform,
  requirePlatformFeed,
  requirePlatformRelay,
};
