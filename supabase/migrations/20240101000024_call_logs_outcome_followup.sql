-- ============================================================
--  Call Logs – outcome update & follow-up date
--
--  1. Replaces the original 6-value outcome CHECK constraint
--     with the new set: Connected | No Answer | Busy |
--     Wrong Number | Follow-up | Converted
--  2. Adds an optional follow_up_at column.
-- ============================================================

-- 1. Add the follow-up date/time column (nullable – only relevant for
--    "Follow-up" outcome, but stored for every row so old logs are
--    unaffected).
ALTER TABLE public.call_logs
  ADD COLUMN IF NOT EXISTS follow_up_at TIMESTAMPTZ;

-- 2. Migrate existing outcome values to the closest new equivalent
--    before touching the constraint so no row violates the new check.
UPDATE public.call_logs SET outcome = 'Connected'  WHERE outcome = 'Interested';
UPDATE public.call_logs SET outcome = 'Connected'  WHERE outcome = 'Callback Requested';
UPDATE public.call_logs SET outcome = 'No Answer'  WHERE outcome = 'Voicemail';
UPDATE public.call_logs SET outcome = 'No Answer'  WHERE outcome = 'Not Interested';
-- 'No Answer' and 'Wrong Number' are identical in old and new sets – no change needed.

-- 3. Drop the old inline CHECK constraint (PostgreSQL auto-names it
--    <table>_<column>_check when no explicit name is given).
ALTER TABLE public.call_logs
  DROP CONSTRAINT IF EXISTS call_logs_outcome_check;

-- 4. Add the new CHECK constraint with the updated value set.
ALTER TABLE public.call_logs
  ADD CONSTRAINT call_logs_outcome_check
  CHECK (outcome IN (
    'Connected',
    'No Answer',
    'Busy',
    'Wrong Number',
    'Follow-up',
    'Converted'
  ));

-- 5. Update the column default to a value in the new set.
ALTER TABLE public.call_logs
  ALTER COLUMN outcome SET DEFAULT 'No Answer';
