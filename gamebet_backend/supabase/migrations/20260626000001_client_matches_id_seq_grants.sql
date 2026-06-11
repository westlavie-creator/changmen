-- client_matches 自增 id 序列：service_role insert 需要 USAGE + SELECT
GRANT USAGE, SELECT ON SEQUENCE client_matches_id_seq TO service_role;
