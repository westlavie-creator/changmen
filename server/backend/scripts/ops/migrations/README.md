# ops/migrations/

数据回填与一次性 schema 迁移（未挂到 `package.json` 的脚本）。

与 `package.json` 中 `db:migrate-*` 的区别：后者为正式迁移入口，本目录多为补跑 / 审计。
