/** 有限并发执行任务（保持每项内部顺序，仅并行多路） */
export async function runPool<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0)
    return;
  const limit = Math.max(1, Math.min(concurrency, items.length));
  let next = 0;

  async function drain(): Promise<void> {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= items.length)
        return;
      await worker(items[i]!);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => drain()));
}
