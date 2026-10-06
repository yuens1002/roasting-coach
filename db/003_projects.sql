-- Roast projects: one bean, a tree of profile versions, the roasts made with
-- each version and the tastings of each roast. Columns mirror the forms in
-- src/core/intake.ts (field id in camelCase -> column in snake_case); a test
-- fails if a form field has no column or a choice option isn't accepted.

-- The bean intake form, filled once per bean. A bean is a roast project.
create table bean (
  id           bigint generated always as identity primary key,
  name         text not null,
  species      text not null check (species in ('arabica', 'robusta', 'blend')),
  decaf        boolean not null,
  process      text not null check (process in ('washed', 'natural', 'honey', 'anaerobic', 'wet-hulled', 'unknown')),
  goal         text not null check (goal in ('filter', 'espresso', 'both', 'cupping')),
  drink_when   text not null check (drink_when in ('soon', 'rest')),
  altitude_m   int check (altitude_m between 0 and 3000),
  origin       text,
  variety      text,
  crop_date    date,
  moisture_pct numeric(4, 1) check (moisture_pct between 5 and 15),
  density_gl   int check (density_gl between 550 and 850),
  chaffy       boolean,
  seller_notes text,
  created_at   timestamptz not null default now()
);

-- What to roast with: a profile at a level. The first version of a bean is its
-- starting profile; every later one has a parent in the same bean and says in
-- one line what changed and why.
create table profile_version (
  id               bigint generated always as identity primary key,
  bean_id          bigint not null references bean (id) on delete cascade,
  parent_id        bigint,
  number           int not null check (number > 0),     -- v1, v2, ... within the bean
  machine_id       text not null references machine (id),
  -- Set when the version is a stock profile; null for one edited by the roaster.
  stock_profile_id text references stock_profile (id),
  profile_name     text not null,                        -- the name the machine shows and logs record
  level            numeric(3, 1) not null,
  -- Level numbers aren't comparable across profiles, so the end temperature is always stored too.
  end_temp_c       numeric(5, 1) not null,
  -- The roaster's own profile file, when it isn't a stock profile. User data: never in the repo.
  profile_file     text,
  change_reason    text,
  created_at       timestamptz not null default now(),
  unique (bean_id, number),
  unique (bean_id, id),
  foreign key (bean_id, parent_id) references profile_version (bean_id, id),
  check (parent_id is null or change_reason is not null),
  check (parent_id is distinct from id)
);

-- One roast made with a version. Repeating a version to confirm it is normal,
-- so a version can have several roasts.
create table roast (
  id                bigint generated always as identity primary key,
  version_id        bigint not null references profile_version (id) on delete cascade,
  roasted_at        timestamptz not null,
  -- The machine's log as uploaded, so features can be recomputed when the parser
  -- improves. Null until the log is uploaded.
  log_format        text check (log_format in ('kaffelogic-klog')),
  log_file          text,
  -- What the log says was actually roasted; can differ from the version if the
  -- roaster picked something else on the machine.
  log_profile_name  text,
  log_level         numeric(3, 1),
  -- RoastFeatures from src/core/features.ts, computed from log_file.
  features          jsonb,
  -- The roast result form.
  green_g           numeric(5, 1) not null check (green_g between 50 and 200),
  roasted_g         numeric(5, 1) not null check (roasted_g between 30 and 200 and roasted_g < green_g),
  weight_loss_pct   numeric(4, 1) generated always as (round((green_g - roasted_g) / green_g * 100, 1)) stored,
  cracks_pressed_ok boolean,
  colour            numeric(5, 1) check (colour between 0 and 150),
  looks             text[] not null default '{}'
                    check (looks <@ array['even', 'uneven', 'tipping', 'oily', 'chaff']),
  created_at        timestamptz not null default now(),
  check ((log_file is null) = (log_format is null)),
  check (features is null or log_file is not null)
);

-- A tasting of a roast after rest. A roast can be tasted more than once.
create table tasting (
  id         bigint generated always as identity primary key,
  roast_id   bigint not null references roast (id) on delete cascade,
  tasted_on  date not null,
  brew       text not null check (brew in ('espresso', 'pourover', 'immersion', 'aeropress', 'moka', 'other')),
  score      smallint not null check (score between 1 and 5),
  taste      text[] not null
             check (cardinality(taste) > 0 and taste <@ array['sweet', 'bright', 'balanced', 'sour', 'grassy', 'bready',
                                                               'astringent', 'flat', 'bitter', 'roasty', 'ashy', 'thin']),
  want_next  text[] not null default '{}'
             check (want_next <@ array['same', 'sweeter', 'brighter', 'less-sour', 'less-bitter', 'more-body', 'lighter', 'darker']),
  notes      text,
  created_at timestamptz not null default now()
);

create index on profile_version (parent_id);
create index on roast (version_id);
create index on tasting (roast_id);
