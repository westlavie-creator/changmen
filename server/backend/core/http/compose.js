/**
 * 轻量 middleware 链：(req, res, next) => …
 * 与 Express/Koa 类似，但不引入框架。
 */

/**
 * @typedef {(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse, next: () => Promise<void>) => unknown | Promise<unknown>} HttpMiddleware
 */

/**
 * @param {...HttpMiddleware} middlewares
 * @returns {(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => Promise<void>}
 */
export function compose(...middlewares) {
  return async function run(req, res) {
    let index = -1;
    async function dispatch(i) {
      if (i <= index)
        throw new Error("next() called multiple times");
      index = i;
      const fn = middlewares[i];
      if (!fn)
        return;
      await fn(req, res, () => dispatch(i + 1));
    }
    await dispatch(0);
  };
}
