/**
 * @typedef {object} PlatformForwardDefinition
 * @property {string} id
 * @property {string} browserPath - Socket.IO path exposed to browser (e.g. /esport/ws-forward/IA)
 * @property {(gateway: string) => { url: string, options: Record<string, unknown> }} buildUpstream
 */

export {};
