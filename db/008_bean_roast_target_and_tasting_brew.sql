-- Two intake answers. The roast colour being shot for, on the SCA / Agtron scale (95 very light to 25 extremely dark), only
-- picks the first level to try on a profile; the defects in the cup decide every step after it. The tasting brew is the
-- roaster's own brew, the one every tasting of the coffee is of, so a difference in the cup is not a difference between kinds
-- of brew (docs/RULES.md, rule 1).
--
-- Beans already stored are converted, not tolerated: every bean has both answers afterwards, so nothing in the tool has a case
-- for a bean without them. A stored bean gets Agtron 55 (medium, the middle of the scale; the roaster restates it any time)
-- and the brew of its newest tasting, or pour over when it has none. The old "Brewing for" answer (goal) is dropped.

alter table bean
  add column agtron_target int check (agtron_target between 25 and 95),
  add column tasting_brew text check (tasting_brew in ('espresso', 'pourover', 'immersion', 'aeropress', 'moka', 'other'));

update bean set agtron_target = 55;
update bean b set tasting_brew = coalesce(
  (select t.brew from tasting t join roast r on r.id = t.roast_id join profile_version v on v.id = r.version_id
    where v.bean_id = b.id order by t.tasted_on desc, t.id desc limit 1),
  'pourover');

alter table bean
  alter column agtron_target set not null,
  alter column tasting_brew set not null,
  drop column goal;

-- The roast form's colour reading is an Agtron reading now, 25 to 95. A stored one outside that was not one, so it is cleared.
update roast set colour = null where colour is not null and colour not between 25 and 95;
alter table roast
  drop constraint roast_colour_check,
  add constraint roast_colour_check check (colour between 25 and 95);
comment on column bean.agtron_target is 'The SCA / Agtron roast colour the roaster is shooting for; only picks the first level to try.';
comment on column bean.tasting_brew is 'The brew every tasting of this coffee is of.';
