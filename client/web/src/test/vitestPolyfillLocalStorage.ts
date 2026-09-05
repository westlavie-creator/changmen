/** Vitest node 环境可能有残缺 localStorage（getItem 不是函数），先补齐再加载 api/client。 */
if (typeof globalThis.localStorage?.getItem !== "function") {
  const mem = new Map();
  globalThis.localStorage = {
    getItem: key => (mem.has(key) ? mem.get(key) : null),
    setItem: (key, value) => {
      mem.set(String(key), String(value));
    },
    removeItem: key => {
      mem.delete(String(key));
    },
    clear: () => mem.clear(),
    key: index => [...mem.keys()][index] ?? null,
    get length() {
      return mem.size;
    },
  };
}
