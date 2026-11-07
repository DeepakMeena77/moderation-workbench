-- S3 and S4 both defined forbid_mutation() with different messages, so the final definition depended on the
-- order the two migrations were applied. Define it once, for every insert-only table (AiRun, Analysis, Decision).
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'insert-only table: % on "%" is not allowed', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
