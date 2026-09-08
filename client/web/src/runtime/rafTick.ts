/** 同一帧内多次 bump 只触发一次 Vue 更新，避免 C105 把整板打满。 */
export function createRafTicker(): (bump: () => void) => void {
  let pending = false;
  let run: (() => void) | null = null;
  return (bump: () => void) => {
    run = bump;
    if (pending)
      return;
    pending = true;
    const flush = () => {
      pending = false;
      const fn = run;
      run = null;
      fn?.();
    };
    if (typeof requestAnimationFrame === "function")
      requestAnimationFrame(flush);
    else
      queueMicrotask(flush);
  };
}

/** 让出一帧给绘制/输入，避免连续解压 C105 把整页卡死。 */
export function yieldToPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function")
      requestAnimationFrame(() => resolve());
    else
      queueMicrotask(resolve);
  });
}
