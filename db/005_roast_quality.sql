-- The tasting's score is now the roast's quality, judged by defects (1: a defect dominates the cup,
-- 3: clean with little character, 5: clean, expressive, balanced and sweet), not how much the roaster
-- likes the cup. Scores recorded before this were an overall liking, so they are NOT quality: every
-- existing row is marked unrated, and the advice skips an unrated tasting until the roaster rates it by
-- the new scale (taste:update with a "quality" answer, which marks it rated).
alter table tasting rename column score to quality;
alter table tasting rename constraint tasting_score_check to tasting_quality_check;
alter table tasting add column quality_rated boolean not null default true;
update tasting set quality_rated = false;

comment on column tasting.quality is 'Roast quality 1-5, judged by defects. For a row with quality_rated = false this is an old overall score, not a quality.';

-- "Next time I want" is no longer asked or used (what the roaster would like is not what the tool
-- coaches on). The column stays so answers already given are not lost.
comment on column tasting.want_next is 'Unused: no longer asked. Kept so earlier answers are not lost.';
