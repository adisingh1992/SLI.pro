-- 0027 — retire `session_status = 'locked'`.
--
-- WING_DECISIONS ruling 1 resolved the C1 conflict in favour of IG-UX01: "every module
-- enterable at any time; depth adapts, access does not." The route layer enforced the
-- opposite — POST /start answered 403, and the Foundation arc was seeded with sessions 2
-- and 3 as 'locked'. That code is gone. This is the data half.
--
-- ── THE VALUE STAYS IN THE ENUM ─────────────────────────────────────────────
-- Retire rows, never delete: the convention `wing-schema.ts` already states. Dropping a
-- value from a Postgres enum means recreating the type and rewriting every dependent
-- column, which is a large amount of risk to remove a string nothing writes.
--
-- What must not survive is a WRITER. A status value that no code enforces is worse than
-- no value at all, because the column then asserts a state that is not in force — three
-- times now in this work (an empty published sequence, a cycle pointed at a draft, a voice
-- register reported from the resolved population rather than the rendered one).
-- `api-contracts` fails the build if `"locked"` is written anywhere under server/.
--
-- ── WHY THE ROWS ARE FLIPPED AND NOT LEFT ───────────────────────────────────
-- Because the code no longer reads them, a row still saying 'locked' would be a student
-- whose session is enterable and whose record says it is not. Any report, export or
-- admin screen reading `status` would be wrong, and the first person to notice would
-- reasonably conclude the lock was still live.
--
-- Only Foundation types are touched. Enhancement Modules already default to available.

BEGIN;

-- What is about to change, in the migration log rather than in someone's memory.
DO $$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n
  FROM "wing"."sessions"
  WHERE "status" = 'locked';
  RAISE NOTICE '0027: % session row(s) carrying the retired status', n;
END $$;

UPDATE "wing"."sessions"
SET "status" = 'available',
    "updated_at" = now()
WHERE "status" = 'locked'
  AND "session_type" IN ('foundation_1', 'foundation_2', 'foundation_3');

-- Any other session type still carrying it is not something this migration invented a
-- policy for, so it is reported rather than rewritten.
DO $$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n FROM "wing"."sessions" WHERE "status" = 'locked';
  IF n > 0 THEN
    RAISE NOTICE '0027: % non-Foundation row(s) still locked — left alone, review these', n;
  ELSE
    RAISE NOTICE '0027: no rows carry the retired status';
  END IF;
END $$;

COMMENT ON COLUMN "wing"."sessions"."status" IS
  'available | in_progress | completed | ended_early. The enum also carries ''locked'', '
  'retired by migration 0027 under WING_DECISIONS ruling 1 (IG-UX01): every session is '
  'enterable at any time. Nothing writes it; prerequisites are informational and are '
  'communicated inside the session. Do not reintroduce a writer.';

COMMIT;
