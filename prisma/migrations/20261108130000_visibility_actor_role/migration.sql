-- Hand-written (docs/02-system-design.md sec. 3, item 3; HUM-1): the visibility trigger no longer trusts the
-- app.actor_type flag alone. A change of Content.visibility (or an INSERT that is not 'visible') also needs
-- app.actor_id to name an existing user whose role is moderator or senior_moderator. services/visibility.ts
-- #setVisibility sets both settings, transaction-local, right before its UPDATE. Code that sets only the flag, or
-- sets it with an author's or admin's id, is refused by the database.
-- Only the function changes: the "Content_visibility_human_only" trigger from S4 keeps calling it.
CREATE OR REPLACE FUNCTION require_human_visibility_change() RETURNS trigger AS $$
DECLARE
  changing boolean;
  actor_id text;
  actor_role text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    changing := NEW."visibility" <> 'visible';
  ELSE
    changing := NEW."visibility" IS DISTINCT FROM OLD."visibility";
  END IF;
  IF NOT changing THEN
    RETURN NEW;
  END IF;

  IF coalesce(current_setting('app.actor_type', true), '') <> 'human' THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'HUM-1: new content must start visible'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RAISE EXCEPTION 'HUM-1: content visibility can only be changed by a human decision'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  actor_id := nullif(current_setting('app.actor_id', true), '');
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'HUM-1: content visibility change names no actor'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT "role"::text INTO actor_role FROM "User" WHERE "id" = actor_id;
  IF actor_role IS NULL OR actor_role NOT IN ('moderator', 'senior_moderator') THEN
    RAISE EXCEPTION 'HUM-1: only a moderator or senior moderator can change content visibility'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
