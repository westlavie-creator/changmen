/**
 * 浏览器侧补齐 Node 全局，供 CJS 依赖（bn.js / ethers v5 via builder-relayer-client）使用。
 * 须在任何会拉到 @polymarket/builder-relayer-client 的 import 之前执行。
 *
 * 使用命名空间 import：buffer@5 / process 均为 CJS，default 在部分 Vite 预构建路径下不稳定。
 */
import * as bufferPkg from "buffer";
import * as processPkg from "process";

const BufferImpl = (bufferPkg as { Buffer?: typeof Buffer }).Buffer
  ?? (bufferPkg as { default?: { Buffer?: typeof Buffer } }).default?.Buffer;

const processImpl = (processPkg as { default?: NodeJS.Process }).default
  ?? (processPkg as unknown as NodeJS.Process);

const g = globalThis as typeof globalThis & {
  Buffer?: typeof Buffer;
  process?: NodeJS.Process;
};

if (BufferImpl && !g.Buffer)
  g.Buffer = BufferImpl;
if (processImpl && !g.process)
  g.process = processImpl;
