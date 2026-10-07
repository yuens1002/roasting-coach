/** The calendar day (YYYY-MM-DD, UTC) of a stored timestamp. */
export const calendarDay = (at: string | Date): string => new Date(at).toISOString().slice(0, 10);

/** Whole calendar days from the roast's day to the tasting's; negative when the tasting is dated first. */
export function daysBetween(roastedAt: string | Date, tastedOn: string): number {
  return Math.round((Date.parse(`${tastedOn}T00:00:00Z`) - Date.parse(`${calendarDay(roastedAt)}T00:00:00Z`)) / 86_400_000);
}
