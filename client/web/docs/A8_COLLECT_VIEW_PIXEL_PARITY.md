# A8 赛事采集页像素对齐清单

本文档用于约束 `UserDiagView -> 赛事采集` 页签与 A8 官方前端一致。

## 语义约定

- 此页开关语义是“是否将赛事/盘口数据上报保存到后端”。
- 对应后端接口：`API_SaveMatch` / `API_SaveBet`。
- 不用于控制 OB 实时赔率是否更新。OB 轮询/MQTT 需常驻，开关仅影响 `saveMatch` / `saveBets` 是否执行。

## 官方基线（A8 bundle 提取）

- 组件：`UserCollectView`
- 默认锁定：`n = true`
- 开关禁用：`el-switch` 全部 `disabled: n.value`
- 解锁动作：仅“信用盘入口”里的“盘”字绑定 `onDblclick`
- 信用盘图标尺寸：`.credit .provider-icon { width: 22px; height: 22px; }`
- 信用盘名称左距：`.credit .name { margin-left: 6px; }`
- 禁用态光标：`.el-switch.is-disabled ... { cursor: not-allowed }`
- 禁用态透明度：`.el-switch.is-disabled { opacity: .6 }`

## changmen 对齐实现

- `src/components/user/CollectConfigPanel.vue`
  - 默认锁定 + 双击「盘」解锁
  - 信用盘行 `div.credit.flex.flex-wrap` + `div.credit-game`（PB/TF/IM/OB/SABA，与 bundle 一致）
  - 图标/名称间距由 `a8.css`（22px / 6px）
- `src/components/user/tabs/UserDiagCollectTab.vue`
  - 仅挂载 `CollectConfigPanel`，无额外包裹
- `src/components/user/UserDiagDialog.vue`
  - `el-dialog` width=880、`show-close=false`、`border-card` tabs
  - 各 Tab 使用 Element Plus + bundle 语义 class

## 回归检查（人工）

1. 打开用户中心 -> `赛事采集`。
2. 初始状态：所有开关置灰不可切换。
3. 仅双击“信用盘入口”的“盘”字后解锁。
4. 解锁前后，信用盘按钮行不跳动；图标视觉尺寸与 A8 一致。
5. 开关关闭时不触发 `API_SaveMatch` / `API_SaveBet`。
6. 开关开启后，才出现对应上报请求。
7. 无论开关开关，OB 页面实时赔率仍持续更新（仅上报行为受影响）。
