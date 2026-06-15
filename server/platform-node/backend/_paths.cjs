"use strict";

const path = require("path");
const { BACKEND_ROOT, CHANGMEN_ROOT } = require("@changmen/db/paths.cjs");

const RESOLVE_PATHS = [
  path.join(BACKEND_ROOT, "node_modules"),
  path.join(CHANGMEN_ROOT, "node_modules"),
];

function reqS(...segments) {
  const entry = `@changmen/shared/${segments.join("/")}`;
  return require(require.resolve(entry, { paths: RESOLVE_PATHS }));
}

function backendRequire(specifier) {
  return require(require.resolve(specifier, { paths: RESOLVE_PATHS }));
}

module.exports = {
  BACKEND_ROOT,
  reqS,
  backendRequire,
};
