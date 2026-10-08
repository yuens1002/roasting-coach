-- What is personal to the roaster who owns this database: their own values for the rule settings
-- and their own meaning for a taste word. Only departures from the defaults in src/core/rules.ts
-- are stored; a missing row means the default. The lists below are kept in step with the code by
-- a test (test/calibration.test.ts).

create table roaster_setting (
  key        text primary key
             check (key in ('stepPct', 'strongStepPct', 'strongChipCount', 'noisePct', 'noResponsePct', 'plateauSteps', 'restTestDays', 'brewTestCount', 'profileTestRoasts', 'holdMinQuality')),
  value      numeric not null,
  updated_at timestamptz not null default now()
);

-- What a taste word means to the rules: under-roasted, over-roasted, a good cup, or nothing they act on.
create table roaster_taste_word (
  word       text primary key
             check (word in ('sweet', 'bright', 'balanced', 'sour', 'grassy', 'bready',
                             'astringent', 'flat', 'bitter', 'roasty', 'ashy', 'thin')),
  meaning    text not null check (meaning in ('under', 'over', 'good', 'none')),
  updated_at timestamptz not null default now()
);
