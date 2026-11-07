-- S7 (docs/02-system-design.md sec. 9, AUD-2, AUD-3): audit events are hash-chained and insert-only.
-- New events are hashed by services/audit.ts#append. Events written before this migration are chained here, in
-- id order, with the same canonical form, so verify() reports the whole history as intact.

ALTER TABLE "AuditEvent" ADD COLUMN "prevHash" TEXT, ADD COLUMN "hash" TEXT;

-- Canonical JSON, matching canonicalJson() in services/audit.ts: object keys sorted by code point, no
-- whitespace, scalars as JSON text. Numbers written by the app round-trip unchanged; only exponent-form numbers
-- (below 1e-6 or from 1e21) would print differently, and audit summaries hold none.
-- PL/pgSQL rather than SQL: a recursive SQL-language function fails body validation when it is created.
CREATE OR REPLACE FUNCTION audit_canonical_json(value jsonb) RETURNS text AS $$
DECLARE
  out text;
BEGIN
  CASE jsonb_typeof(value)
    WHEN 'object' THEN
      SELECT '{' || coalesce(string_agg(to_json(k)::text || ':' || audit_canonical_json(v), ',' ORDER BY k COLLATE "C"), '') || '}'
        INTO out FROM jsonb_each(value) AS o(k, v);
    WHEN 'array' THEN
      SELECT '[' || coalesce(string_agg(audit_canonical_json(elem), ',' ORDER BY ord), '') || ']'
        INTO out FROM jsonb_array_elements(value) WITH ORDINALITY AS a(elem, ord);
    ELSE
      out := value::text;
  END CASE;
  RETURN out;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- The hash of one event given the previous event's hash: the same fields, in the same canonical form, as
-- services/audit.ts#eventHash. "at" is stored in UTC with millisecond precision, like Date#toISOString().
CREATE OR REPLACE FUNCTION audit_event_hash(prev_hash text, e "AuditEvent") RETURNS text AS $$
  SELECT encode(sha256(convert_to(prev_hash || audit_canonical_json(jsonb_build_object(
    'action', e."action",
    'actorId', e."actorId",
    'actorType', e."actorType"::text,
    'after', e."after",
    'at', to_char(e."at", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'before', e."before",
    'entityId', e."entityId",
    'entityType', e."entityType",
    'policyVersion', e."policyVersion",
    'requestId', e."requestId"
  )), 'UTF8')), 'hex');
$$ LANGUAGE sql STABLE;

-- Chain the existing events. The first event's prevHash is 64 zeros (GENESIS_HASH in services/audit.ts).
DO $$
DECLARE
  r "AuditEvent";
  prev text := repeat('0', 64);
  next_hash text;
BEGIN
  FOR r IN SELECT * FROM "AuditEvent" ORDER BY "id" LOOP
    next_hash := audit_event_hash(prev, r);
    UPDATE "AuditEvent" SET "prevHash" = prev, "hash" = next_hash WHERE "id" = r."id";
    prev := next_hash;
  END LOOP;
END $$;

ALTER TABLE "AuditEvent" ALTER COLUMN "prevHash" SET NOT NULL, ALTER COLUMN "hash" SET NOT NULL;

-- AUD-2: attach the shared forbid_mutation() function (defined in earlier migrations, not redefined here).
-- Attached after the backfill, which is the last UPDATE this table ever accepts.
CREATE TRIGGER "AuditEvent_insert_only"
  BEFORE UPDATE OR DELETE ON "AuditEvent"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
