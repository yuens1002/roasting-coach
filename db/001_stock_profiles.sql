-- Stock roast profiles that ship with each machine, and the levels we suggest
-- on them. Only names and numbers derived from the profile files live here:
-- no profile files, curves or description text (see docs/thread1-notes.md §5).

create table machine (
  id   text primary key,           -- 'kaffelogic-nano7'
  name text not null
);

create table stock_profile (
  id                   text primary key,  -- slug, e.g. 'kaffelogic-nano7/1500-2000m-rtd'
  machine_id           text not null references machine (id),
  name                 text not null,     -- the name the machine shows and logs record
  version              text,
  family               text not null check (family in ('altitude', 'process', 'special', 'legacy')),
  -- What the profile is meant for; null means "not specific to this".
  altitude_min_m       int,
  altitude_max_m       int,
  drink_when           text check (drink_when in ('soon', 'rest')),
  process              text check (process in ('washed', 'natural')),
  species              text check (species in ('arabica', 'robusta')),
  decaf                boolean not null default false,
  -- End temperature for levels 0..6; fractional levels interpolate (see level_to_temp).
  roast_levels_c       numeric(5, 1)[] not null check (cardinality(roast_levels_c) = 7),
  expect_first_crack_c numeric(5, 1),
  -- False for profiles we recognise in logs but never suggest as a starting point.
  selectable           boolean not null default true,
  unique (machine_id, name),
  check (altitude_min_m is null or altitude_max_m > altitude_min_m)
);

create table stock_profile_level (
  profile_id               text not null references stock_profile (id) on delete cascade,
  goal                     text not null check (goal in ('filter', 'espresso', 'dark', 'cupping')),
  level                    numeric(3, 1) not null,
  end_temp_c               numeric(5, 1) not null,
  -- When the profile curve reaches end_temp_c, seconds from start.
  ends_at_s                int not null check (ends_at_s > 0),
  -- Targets the profile itself states, where it states them.
  dev_target_min_pct       numeric(4, 1),
  dev_target_max_pct       numeric(4, 1),
  rise_after_crack_min_c   numeric(4, 1),
  rise_after_crack_max_c   numeric(4, 1),
  primary key (profile_id, goal),
  check (dev_target_min_pct is null or dev_target_max_pct >= dev_target_min_pct),
  check (rise_after_crack_min_c is null or rise_after_crack_max_c >= rise_after_crack_min_c)
);

-- End temperature for a (possibly fractional) level: levels index roast_levels_c
-- from 0 and interpolate linearly, clamped to 0..6. Mirrors levelToTemp in TypeScript.
create function level_to_temp(levels numeric[], lvl numeric) returns numeric
language sql immutable strict as $$
  select levels[i + 1] + (l - i) * (levels[i + 2] - levels[i + 1])
  from (select least(greatest(lvl, 0), 6) as l) c,
       lateral (select least(floor(l)::int, 5) as i) idx
$$;
