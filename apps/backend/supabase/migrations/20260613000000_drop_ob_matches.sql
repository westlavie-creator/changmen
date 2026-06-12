-- ob_matches 是 platform_matches 设计前的历史遗留表，仅存 OB 一个平台。
-- 现在后端 FeedHub 的 OB 数据改为写入 platform_matches（platform='OB'），
-- ob_matches 不再有任何写入，予以废弃。

DROP TABLE IF EXISTS ob_matches;
