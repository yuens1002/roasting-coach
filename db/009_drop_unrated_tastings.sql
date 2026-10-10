-- Convert, do not tolerate (docs/ROADMAP.md, 2026-10-10). Leftovers of earlier changes are removed with their data:
--
-- 1. Migration 005 marked every tasting recorded before roast quality replaced the overall score as unrated
--    (quality_rated = false), and the advice skipped those until the roaster rated them. They hold a liking, not a
--    quality, and nothing can turn one into the other, so they are deleted; the column goes with them.
-- 2. "Next time I want" is no longer asked or used (the tool coaches the roast, not the taste); want_next was kept so
--    answers already given were not lost. They are dropped.

delete from tasting where quality_rated = false;
alter table tasting
  drop column quality_rated,
  drop column want_next;
comment on column tasting.quality is 'Roast quality 1-5, judged by defects, not by liking.';

-- A clean cup is done for what this tool can do (docs/ROADMAP.md, 2026-10-10), so the settings that sized a "fair test" of the
-- level, of the other profile, and the bar a clean cup is held at are gone. The list of allowed keys is kept in step with the
-- code by a test (test/calibration.test.ts).
delete from roaster_setting where key in ('plateauSteps', 'profileTestRoasts', 'holdMinQuality');
alter table roaster_setting drop constraint roaster_setting_key_check;
alter table roaster_setting add constraint roaster_setting_key_check
  check (key in ('stepPct', 'strongStepPct', 'strongChipCount', 'noisePct', 'noResponsePct'));
