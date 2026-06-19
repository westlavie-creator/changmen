/** @typedef {import('../core/types.js').PlatformForwardDefinition} PlatformForwardDefinition */

/** @type {Map<string, PlatformForwardDefinition>} */
const definitions = new Map();

/** @param {PlatformForwardDefinition} definition */
export function registerPlatformForward(definition) {
  definitions.set(definition.id, definition);
}

/** @returns {PlatformForwardDefinition[]} */
export function listPlatformForwards() {
  return [...definitions.values()];
}

/** @param {string} id */
export function getPlatformForward(id) {
  return definitions.get(id);
}
