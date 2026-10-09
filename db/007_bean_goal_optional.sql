-- How a bean will be brewed no longer decides how it is roasted (docs/ROADMAP.md, 2026-10-09), so the intake
-- no longer asks "Brewing for". Earlier answers are kept in the column and not used.

alter table bean alter column goal drop not null;
