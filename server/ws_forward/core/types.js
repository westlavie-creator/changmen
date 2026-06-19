/**
 * @typedef {object} SocketIoForwardDefinition
 * @property {'socket.io'} transport
 * @property {string} id
 * @property {string} browserPath
 * @property {(gateway?: string) => { url: string, options: Record<string, unknown> }} buildUpstream
 */

/**
 * @typedef {object} RawWsForwardDefinition
 * @property {'raw-ws'} transport
 * @property {string} id
 * @property {string} browserPath
 * @property {(req: import('node:http').IncomingMessage) => { url: string, headers?: Record<string, string> }} resolveUpstream
 */

/** @typedef {SocketIoForwardDefinition | RawWsForwardDefinition} PlatformForwardDefinition */

export {};
