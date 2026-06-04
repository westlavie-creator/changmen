-- 所有数据表改为 authenticated 可写
-- service_role 只保留给 auth.admin API（signOut / writeUserMetadata）

CREATE POLICY "ob_matches: authenticated write"
  ON ob_matches FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "ob_matches: authenticated update"
  ON ob_matches FOR UPDATE TO authenticated USING (true);

CREATE POLICY "ob_matches: authenticated delete"
  ON ob_matches FOR DELETE TO authenticated USING (true);

CREATE POLICY "client_matches: authenticated write"
  ON client_matches FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "client_matches: authenticated update"
  ON client_matches FOR UPDATE TO authenticated USING (true);
