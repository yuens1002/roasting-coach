-- Rest and brew are no longer levers (docs/RULES.md, rule 7): they change the cup, not the roast, so the
-- two settings that sized a fair test of them are gone. Roasts are compared in one brew instead.
-- The list of allowed keys is kept in step with the code by a test (test/calibration.test.ts).

delete from roaster_setting where key in ('restTestDays', 'brewTestCount');

alter table roaster_setting drop constraint roaster_setting_key_check;
alter table roaster_setting add constraint roaster_setting_key_check
  check (key in ('stepPct', 'strongStepPct', 'strongChipCount', 'noisePct', 'noResponsePct', 'plateauSteps', 'profileTestRoasts', 'holdMinQuality'));
