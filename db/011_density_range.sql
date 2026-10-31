-- Density is whatever the roaster's own instrument reads, the same instrument for every bean (docs/ROADMAP.md, 2026-10-31), not only
-- a bulk density weighed from a known volume. Some instruments read above 850 g/L, so the range widens to 550 to 1300 g/L.
-- Every value already stored is inside the new range: nothing is converted.

alter table bean drop constraint bean_density_gl_check;
alter table bean add constraint bean_density_gl_check check (density_gl between 550 and 1300);
