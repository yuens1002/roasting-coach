-- A colour reading says how it was read (docs/ROADMAP.md, 2026-10-28): with a colour meter, or against the roast colour card on
-- a ground sample. The two do not read the same, so readings of one method are fitted together and never mixed.
--
-- Convert, do not tolerate: until now the roast form took a reading "only with a colour meter", so every reading already stored
-- was a meter's. A reading with no method is not allowed from here on: a reading and its method are both given or both absent.

alter table roast add column colour_method text check (colour_method in ('meter', 'card'));
update roast set colour_method = 'meter' where colour is not null;
alter table roast add constraint roast_colour_has_method check ((colour is null) = (colour_method is null));
comment on column roast.colour_method is 'How the colour reading was taken: meter (a colour meter) or card (the roast colour card, against a ground sample).';
