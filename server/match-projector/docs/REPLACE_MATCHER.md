# 用投影引擎接替旧 matcher 主客逻辑

> **过渡说明**：从零合场请用 [`@changmen/match-composer`](../../match-composer/docs/REPLACE.md)
> （`MATCHER_WRITER=composer`）。本包是「旧 merge + 主客覆写」过渡层，切流后不再生产写库。

## 生产红线（必读）

1. **默认 `legacy`，未充分 diff/灰度前勿开 `MATCHER_SIDE_ENGINE=projector`**
2. gb 写库：普通 `null` **保留**旧锁；仅 `_clearGbLock` 写哨兵 `0` 才清空（防 legacy 偶发清锁）
3. 开 projector 后会重跑 `trimMapZero` / OB gate；IA-only 会清锁+空盘（产品需接受）
4. **禁止**同时开独立 `MATCH_PROJECTOR_WRITE=1` 循环

## 推荐接替方式（同进程，不另起写库循环）

在 `server/backend/.env`：

```bat
MATCHER_SIDE_ENGINE=projector
```

效果：

- 现有 embedded `matchMergeOnce`（循环 / SaveLiveTimer / UI 连线）写库前自动跑投影
- 后置 `patchCollector` / snapshot invalidate / backfill **保持不变**
- archive 仍由 matcher loop 执行
- **不要**同时开独立 `MATCH_PROJECTOR_WRITE=1` 循环（会双写）

验证：

```bat
npm run projector:test
npm run projector:diff
REM 设 MATCHER_SIDE_ENGINE=projector 后重启 backend，观察日志 sideEngine=projector
```

## 仍存在的接替缺口（接引擎后）

| 项 | 说明 | 风险 |
|----|------|------|
| 连线 `force_aligned` | 投影侧：reversed 仍 reverse；ambiguous 仍 omit | UI「强制正向」语义变了；防同边优先 |
| `swap-gb` | 默认会 `upgrade` 回最高锚点朝向 | 需 `MATCH_PROJECTOR_STICKY_ORIENTATION=1` 才保留人工翻转 |
| finalize 仍先跑旧 reconcile | 再被投影覆盖 | 多一次 CPU；无双写语义 |
| 合场/对齐/归档 | 仍在旧 matcher | 非本包范围 |
| 独立 projector WRITE | 仅 dry-run/diff 用 | 勿与 legacy 双开 |

## 独立 projector 进程（仅对照，不建议生产双写）

```bat
REM 必须先停旧 matcher 心跳
set MATCH_PROJECTOR_WRITE=1
npm run projector:start
```

写后置已对齐 patchCollector / invalidate / backfill / archive。

## 已修接替硬伤

1. gb UPSERT：`null` 保留旧锁；哨兵 `0`（`_clearGbLock`）才清空 — **禁止**对 legacy 用裸 EXCLUDED
2. `MATCHER_SIDE_ENGINE=projector` 挂入全部写路径；失败 **abort 不写库**
3. 投影后重跑 `trimMapZero` / OB gate / strip orphan
4. 高优先级锚点后到 `upgrade`；仅 PM/OB/RAY 槽位才 `existing-gap`
5. legacy reconcile 不再对 promote 行二次 swap
