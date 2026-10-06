// Reads and writes roast projects (db/003_projects.sql). Every form is checked
// against its field definitions before anything is stored, and versions and
// roasts are addressed the way a person talks about them: bean id plus "v3".
import { levelToTemp, parseKlog, parseKpro } from "../adapters/kaffelogic/parse.js";
import { MACHINE_ID, STOCK_PROFILES, selectStartingProfile, stockProfileId } from "../adapters/kaffelogic/startingProfiles.js";
import { kaffelogicToRoastLog } from "../adapters/kaffelogic/toRoastLog.js";
import { type KaffelogicFile, type ProfileLines, findBaseProfile, formatKpro, profileFromKpro, profileFromLog, sameProfileBody } from "../adapters/kaffelogic/writeProfile.js";
import { extractFeatures } from "../core/features.js";
import { type Field, type Intake, INTAKE_FIELDS, ROAST_FIELDS, TASTING_FIELDS } from "../core/intake.js";
import type { RoastFeatures, RoastLog } from "../core/types.js";
import { type Answers, type Shape, checkAnswers, checkShape } from "../core/validate.js";

/** The one method both pg.Client and PGlite provide. */
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

/** Thrown for input the person can fix; the messages are written for them. */
export class InputError extends Error {
  constructor(readonly errors: string[]) {
    super(errors.join("\n"));
  }
}

/** Form field id to column name: cropDate -> crop_date, densityGL -> density_gl. */
export const fieldColumn = (fieldId: string) => fieldId.replace(/[A-Z]+/g, (m) => `_${m.toLowerCase()}`);

const num = (v: unknown) => (v === null || v === undefined ? undefined : Number(v));
const round1 = (n: number) => Math.round(n * 10) / 10;

function checked(fields: Field[], input: Record<string, unknown>): Answers {
  const r = checkAnswers(fields, input);
  if (!r.ok) throw new InputError(r.errors);
  return r.values;
}

function checkedShape(input: unknown, shape: Shape) {
  const errors = checkShape(input, shape);
  if (errors.length) throw new InputError(errors);
}

/** The input shapes of the commands, around their form answers. Exported so scripts check the same way. */
export const NEW_VERSION_SHAPE: Shape = {
  beanId: { type: "integer", required: true },
  parent: { type: "integer" },
  profileName: { type: "string" },
  level: { type: "number", required: true },
  reason: { type: "string" },
  profileFile: { type: "string" },
  endTempC: { type: "number" },
};
export const NEW_ROAST_SHAPE: Shape = {
  beanId: { type: "integer", required: true },
  version: { type: "integer" },
  klog: { type: "string" },
  roastedAt: { type: "string" },
  answers: { type: "object", required: true },
  reason: { type: "string" },
};
export const NEW_TASTING_SHAPE: Shape = {
  beanId: { type: "integer", required: true },
  roastId: { type: "integer" },
  answers: { type: "object", required: true },
};

/** A stock profile by name; own keys only, so names like "constructor" aren't found on Object.prototype. */
const stockProfile = (name: string) => (Object.hasOwn(STOCK_PROFILES, name) ? STOCK_PROFILES[name] : undefined);

/** End temperature for a level on a profile's seven levels; refuses a profile whose levels are missing or broken. */
function endTempFor(levels: number[], level: number, profileName: string): number {
  const t = levels.length === 7 ? levelToTemp(levels, level) : undefined;
  if (t === undefined || !Number.isFinite(t)) throw new InputError([`"${profileName}" doesn't list its seven roast levels, so its end temperature can't be worked out.`]);
  return round1(t);
}

/** Same seven level temperatures, within the 6 significant figures logs write. */
const sameLevels = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) <= 0.05);

async function insert(db: Db, table: string, row: Record<string, unknown>): Promise<number> {
  const cols = Object.keys(row);
  const r = await db.query<{ id: string | number }>(
    `insert into ${table} (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning id`,
    Object.values(row),
  );
  return Number(r.rows[0].id);
}

const asColumns = (values: Answers) => Object.fromEntries(Object.entries(values).map(([k, v]) => [fieldColumn(k), v]));

async function inTransaction<T>(db: Db, fn: () => Promise<T>): Promise<T> {
  await db.query("begin");
  try {
    const result = await fn();
    await db.query("commit");
    return result;
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
}

export interface VersionRow {
  id: number;
  number: number;
  parentNumber?: number;
  profileName: string;
  level: number;
  endTempC: number;
  changeReason?: string;
  /** The stock profile this version is built on, by name. */
  baseProfile?: string;
  /** Whether a .kpro written for this version is stored with it. */
  hasProfileFile: boolean;
}

const VERSION_SELECT = `
  select v.id, v.number, p.number as parent_number, v.profile_name, v.level, v.end_temp_c, v.change_reason,
         s.name as base_profile, v.profile_file is not null as has_profile_file
    from profile_version v
    left join profile_version p on p.id = v.parent_id
    left join stock_profile s on s.id = v.stock_profile_id`;

function toVersion(r: Record<string, unknown>): VersionRow {
  return {
    id: Number(r.id),
    number: Number(r.number),
    parentNumber: num(r.parent_number),
    profileName: String(r.profile_name),
    level: Number(r.level),
    endTempC: Number(r.end_temp_c),
    changeReason: (r.change_reason as string | null) ?? undefined,
    baseProfile: (r.base_profile as string | null) ?? undefined,
    hasProfileFile: Boolean(r.has_profile_file),
  };
}

/** A version of a bean by number, or its newest version when no number is given. */
async function findVersion(db: Db, beanId: number, number?: number): Promise<VersionRow> {
  const r = await db.query(
    number === undefined ? `${VERSION_SELECT} where v.bean_id = $1 order by v.number desc limit 1` : `${VERSION_SELECT} where v.bean_id = $1 and v.number = $2`,
    number === undefined ? [beanId] : [beanId, number],
  );
  if (!r.rows.length) throw new InputError([number === undefined ? `Bean ${beanId} doesn't exist or has no versions.` : `Bean ${beanId} has no v${number}.`]);
  return toVersion(r.rows[0]);
}

/** What the intake chose, handed to whoever builds the bean's own .kpro from it. */
export interface StartingChoice {
  beanName: string;
  stockName: string;
  level: number;
  endTempC: number;
  why: string[];
}

/** A .kpro for v1: the name the machine will show and the file's text. Undefined keeps the stock profile. */
export type StartingProfileFile = (start: StartingChoice) => { profileName: string; profileFile: string } | undefined;

/** Bean intake: stores the bean and its starting profile, at the suggested level, as v1; as its own .kpro when makeFile gives one. */
export async function addBean(db: Db, input: Record<string, unknown>, makeFile?: StartingProfileFile) {
  const values = checked(INTAKE_FIELDS, input);
  const start = selectStartingProfile(values as unknown as Intake);
  const own = makeFile?.({ beanName: String(values.name), stockName: start.profile.name, level: start.level.level, endTempC: start.level.endTemp, why: start.why });
  return inTransaction(db, async () => {
    const beanId = await insert(db, "bean", asColumns(values));
    await insert(db, "profile_version", {
      bean_id: beanId,
      number: 1,
      machine_id: MACHINE_ID,
      stock_profile_id: stockProfileId(start.profile.name),
      profile_name: own?.profileName ?? start.profile.name,
      level: start.level.level,
      end_temp_c: start.level.endTemp,
      profile_file: own?.profileFile ?? null,
      change_reason: `Starting profile. ${start.why.join(" ")}`,
    });
    return {
      beanId,
      version: await findVersion(db, beanId, 1),
      goal: start.goal,
      endsAt: start.level.endsAt,
      alternative: start.alternative,
      why: start.why,
    };
  });
}

export interface NewVersion {
  beanId: number;
  /** The version this one changes; defaults to the newest. */
  parent?: number;
  /**
   * The profile to roast with. Leave out to keep the parent's (a level-only change, the usual
   * case: the level is set on the machine before each roast). Otherwise a stock profile name,
   * or the name of a profile given as profileFile.
   */
  profileName?: string;
  /** The level to set on the machine before roasting. */
  level: number;
  reason: string;
  /** A .kpro written for this version because the profile itself changed; its levels give the end temperature. */
  profileFile?: string;
  /** Only for a profile that is neither stock nor stored as a file. */
  endTempC?: number;
}

/** The .kpro stored with a version, if it has one. */
export async function versionProfileFile(db: Db, beanId: number, number?: number): Promise<string | undefined> {
  const v = await findVersion(db, beanId, number);
  const r = await db.query<{ profile_file: string | null }>("select profile_file from profile_version where id = $1", [v.id]);
  return r.rows[0].profile_file ?? undefined;
}

/** The next version of a bean: what changed and, in one line, why. */
export async function addVersion(db: Db, v: NewVersion): Promise<VersionRow> {
  checkedShape(v, NEW_VERSION_SHAPE);
  const errors: string[] = [];
  if (!v.reason?.trim()) errors.push("Say in one line what changed and why.");
  if (!(v.level >= 0 && v.level <= 6)) errors.push(`Level must be between 0 and 6; got ${v.level}.`);
  if (errors.length) throw new InputError(errors);
  const parent = await findVersion(db, v.beanId, v.parent);
  const sameProfile = v.profileName === undefined || (v.profileName === parent.profileName && v.profileFile === undefined);
  const profileName = v.profileName ?? parent.profileName;
  const profileFile = v.profileFile ?? (sameProfile ? await versionProfileFile(db, v.beanId, parent.number) : undefined);
  const stock = profileFile === undefined ? stockProfile(profileName) : undefined;
  let levels = stock?.roastLevels;
  if (!levels && profileFile !== undefined) {
    try {
      levels = parseKpro(profileFile).roastLevels;
    } catch (e) {
      throw new InputError([`The profile file for "${profileName}" can't be read as a Kaffelogic profile (${(e as Error).message}).`]);
    }
  }
  if (!levels && v.endTempC === undefined) throw new InputError([`"${profileName}" isn't a stock profile and has no stored file, so give its end temperature (endTempC) too.`]);
  const endTempC = levels ? endTempFor(levels, v.level, profileName) : v.endTempC!;
  const next = await db.query<{ n: number }>("select coalesce(max(number), 0) + 1 as n from profile_version where bean_id = $1", [v.beanId]);
  const number = Number(next.rows[0].n);
  await insert(db, "profile_version", {
    bean_id: v.beanId,
    parent_id: parent.id,
    number,
    machine_id: MACHINE_ID,
    // A version built on a stock profile keeps pointing at it, through any number of edits.
    stock_profile_id: stock ? stockProfileId(stock.name) : parent.baseProfile ? stockProfileId(parent.baseProfile) : null,
    profile_name: profileName,
    level: v.level,
    end_temp_c: round1(endTempC),
    profile_file: profileFile ?? null,
    change_reason: v.reason.trim(),
  });
  return findVersion(db, v.beanId, number);
}

export interface NewRoast {
  beanId: number;
  /** Which version was roasted; defaults to the newest. */
  version?: number;
  /** The .klog file's text, if there is one yet. */
  klog?: string;
  /** When it was roasted (ISO 8601). Needed when the log has no date, as some Nano logs don't. */
  roastedAt?: string;
  /** The roast result form (ROAST_FIELDS). */
  answers: Record<string, unknown>;
  /** Why the roast differs from the version, when the log shows it does (see matchLogToVersion). */
  reason?: string;
}

/**
 * Versions record what was actually roasted. The log decides: if it matches the version (same
 * profile body, whatever its name, and same level) the roast belongs to it. If it differs and
 * the version hasn't been roasted yet, the version was only a plan, so it becomes what was
 * roasted, keeping a note of the plan. If it differs and the version already has roasts, the
 * roast starts a new version, which needs a reason.
 */
async function matchLogToVersion(db: Db, r: NewRoast, target: VersionRow, logged: ProfileLines, loggedName: string | undefined, loggedLevel: number | undefined, library: KaffelogicFile[]) {
  const file = await versionProfileFile(db, r.beanId, target.number);
  const loggedLevels = parseKpro(formatKpro(logged)).roastLevels;
  // Same profile means same curve and settings. A version with a stored file is compared body to
  // body. One without (a stock profile by name) is compared body to body with the roaster's own
  // copy of that profile when their library has one. Without it, the seven level temperatures
  // from the stock table are all we hold of it (the repository stores no curves), so an edit that
  // changes only the curve or fan can't be told apart until the roaster adds the stock .kpro.
  const sameName = loggedName === undefined || loggedName === target.profileName;
  const reference = file === undefined ? findBaseProfile(library, { name: target.profileName }) : undefined;
  const targetStock = file === undefined ? stockProfile(target.profileName) : undefined;
  const sameProfile = file
    ? sameProfileBody(profileFromKpro(file), logged)
    : reference?.from === "kpro"
      ? sameName && sameProfileBody(reference.lines, logged)
      : sameName && (!targetStock || sameLevels(targetStock.roastLevels, loggedLevels));
  const sameLevel = loggedLevel === undefined || Math.abs(loggedLevel - target.level) <= 0.05;
  if (sameProfile && sameLevel) {
    // The first log of a version without a file shows exactly which profile it is; keep it, so
    // later logs are compared curve for curve.
    if (file === undefined) await db.query("update profile_version set profile_file = $2 where id = $1", [target.id, formatKpro(logged)]);
    return { version: target };
  }

  const name = sameProfile ? target.profileName : (loggedName ?? target.profileName);
  const level = loggedLevel ?? target.level;
  const edited = !sameProfile && name === target.profileName ? " (a different curve or settings under the same name)" : "";
  const roasted = `${name}${edited} at level ${level}`;
  const planned = `${target.profileName} at level ${target.level}`;
  // The log carries the profile it was roasted with, whole: it becomes the version's own file.
  const profileFile = sameProfile ? (file ?? formatKpro(logged)) : formatKpro(logged);
  // The log's profile counts as a stock one only when the roaster's own copy of that stock profile
  // confirms it body to body. A matching name and levels alone aren't enough: the curve or fan may
  // have been edited, and recording it as stock would lose what was actually roasted.
  const named = sameProfile ? undefined : stockProfile(name);
  const namedRef = named ? findBaseProfile(library, { name }) : undefined;
  const stock = named && namedRef?.from === "kpro" && sameProfileBody(namedRef.lines, logged) ? named : undefined;

  const roasts = await db.query("select 1 from roast where version_id = $1 limit 1", [target.id]);
  if (roasts.rows.length) {
    if (!r.reason?.trim())
      throw new InputError([`This log was roasted on ${roasted}, but v${target.number} is ${planned} and has already been roasted. Say in one line what you changed and why, and it will be recorded as a new version.`]);
    // A switch to a stock profile is recorded by name, so the version points at it as its base.
    const v = await addVersion(db, { beanId: r.beanId, parent: target.number, profileName: name, level, reason: r.reason, profileFile: sameProfile || stock ? undefined : profileFile });
    return { version: v, change: `Recorded as v${v.number}: ${roasted} (v${target.number} is ${planned}).` };
  }

  const why = `Planned ${planned}; roasted ${roasted}${r.reason?.trim() ? `: ${r.reason.trim()}` : "."}`;
  await db.query(
    `update profile_version
        set profile_name = $2, profile_file = $3, level = $4, end_temp_c = $5,
            stock_profile_id = coalesce($6, stock_profile_id),
            change_reason = trim(coalesce(change_reason, '') || ' ' || $7)
      where id = $1`,
    [target.id, name, profileFile, level, endTempFor(loggedLevels, level, name), stock ? stockProfileId(stock.name) : null, why],
  );
  return { version: await findVersion(db, r.beanId, target.number), change: `v${target.number} hadn't been roasted yet, so it now records what was: ${roasted} (planned: ${planned}).` };
}

/**
 * A roast: the result form plus, when given, the machine's log and the features computed from it.
 * `library` is the roaster's own Kaffelogic files; with them, a log is checked against the real
 * stock profile it claims to be (see matchLogToVersion).
 */
export async function addRoast(db: Db, r: NewRoast, library: KaffelogicFile[] = []) {
  checkedShape(r, NEW_ROAST_SHAPE);
  const values = checked(ROAST_FIELDS, r.answers);
  if (Number(values.roastedG) >= Number(values.greenG)) throw new InputError(["Roasted weight must be less than green weight."]);
  if (r.roastedAt !== undefined && Number.isNaN(Date.parse(r.roastedAt))) throw new InputError([`"${r.roastedAt}" isn't a date; use e.g. 2026-10-04 or 2026-10-04T09:30:00.`]);
  return inTransaction(db, async () => {
    let version = await findVersion(db, r.beanId, r.version);
    let versionChange: string | undefined;
    const warnings: string[] = [];
    let logColumns: Record<string, unknown> = {};
    let features: RoastFeatures | undefined;
    let roastedAt = r.roastedAt;
    if (r.klog !== undefined) {
      let log: RoastLog;
      let logged: ProfileLines;
      try {
        log = kaffelogicToRoastLog(parseKlog(r.klog));
        features = extractFeatures(log);
        logged = profileFromLog(r.klog);
      } catch (e) {
        throw new InputError([`That file can't be read as a Kaffelogic roast log (${(e as Error).message}). Check the path points at a .klog.`]);
      }
      roastedAt ??= log.roastDate;
      if (!roastedAt) throw new InputError(["The log has no roast date. When was it roasted?"]);
      ({ version, change: versionChange } = await matchLogToVersion(db, r, version, logged, log.profileName, log.nativeLevel, library));
      warnings.push(...features.dataWarnings);
      logColumns = { log_format: "kaffelogic-klog", log_file: r.klog, log_profile_name: log.profileName ?? null, log_level: log.nativeLevel ?? null, features };
    }
    roastedAt ??= new Date().toISOString(); // no log: recorded right after roasting
    const roastId = await insert(db, "roast", { version_id: version.id, roasted_at: roastedAt, ...logColumns, ...asColumns(values) });
    const wl = await db.query<{ weight_loss_pct: string }>("select weight_loss_pct from roast where id = $1", [roastId]);
    return { roastId, version: version.number, versionChange, roastedAt, weightLossPct: Number(wl.rows[0].weight_loss_pct), features, warnings };
  });
}

/** Recomputes every stored roast's features from its stored log, after the parser or features improve. */
export async function refreshFeatures(db: Db) {
  const r = await db.query<{ id: string | number; log_file: string }>("select id, log_file from roast where log_file is not null order by id");
  for (const row of r.rows) {
    const features = extractFeatures(kaffelogicToRoastLog(parseKlog(row.log_file)));
    await db.query("update roast set features = $2 where id = $1", [row.id, features]);
  }
  return { refreshed: r.rows.length };
}

/** Deletes a bean with its versions, roasts and tastings. Only when the roaster asks for it. */
export async function removeBean(db: Db, beanId: number) {
  const r = await db.query<{ name: string }>("delete from bean where id = $1 returning name", [beanId]);
  if (!r.rows.length) throw new InputError([`Bean ${beanId} doesn't exist.`]);
  return { removed: beanId, name: r.rows[0].name };
}

export interface NewTasting {
  beanId: number;
  /** Which roast was tasted; defaults to the bean's newest roast. */
  roastId?: number;
  /** The tasting form (TASTING_FIELDS). */
  answers: Record<string, unknown>;
}

export async function addTasting(db: Db, t: NewTasting) {
  checkedShape(t, NEW_TASTING_SHAPE);
  const values = checked(TASTING_FIELDS, t.answers);
  const r = await db.query<{ id: string | number; roasted_at: string | Date; number: number }>(
    `select r.id, r.roasted_at, v.number from roast r join profile_version v on v.id = r.version_id
      where v.bean_id = $1 ${t.roastId === undefined ? "" : "and r.id = $2"} order by r.roasted_at desc, r.id desc limit 1`,
    t.roastId === undefined ? [t.beanId] : [t.beanId, t.roastId],
  );
  if (!r.rows.length) throw new InputError([t.roastId === undefined ? `Bean ${t.beanId} has no roasts yet.` : `Bean ${t.beanId} has no roast ${t.roastId}.`]);
  const roast = r.rows[0];
  const daysRested = restDays(roast.roasted_at, values.tastedOn);
  const tastingId = await insert(db, "tasting", { roast_id: Number(roast.id), ...asColumns(values) });
  return { tastingId, roastId: Number(roast.id), version: Number(roast.number), daysRested };
}

export const BEAN_UPDATE_SHAPE: Shape = { beanId: { type: "integer", required: true }, answers: { type: "object", required: true } };
export const TASTING_UPDATE_SHAPE: Shape = { tastingId: { type: "integer", required: true }, answers: { type: "object", required: true } };

/** A stored row as form answers: the form's own fields, empty columns left out, choices as their option text. */
function rowAsAnswers(fields: Field[], row: Record<string, unknown>): Record<string, unknown> {
  const answers: Record<string, unknown> = {};
  for (const f of fields) {
    const v = row[fieldColumn(f.id)];
    if (v === null || v === undefined) continue;
    answers[f.id] = f.kind === "choice" ? String(v) : v;
  }
  return answers;
}

/**
 * Whole days from the roast's calendar date to the tasting's. One rule for adding and updating a
 * tasting, so a tasting dated before its roast is refused either way.
 */
function restDays(roastedAt: string | Date, tastedOn: unknown): number {
  const roastedOn = new Date(roastedAt).toISOString().slice(0, 10);
  const days = Math.round((Date.parse(`${tastedOn}T00:00:00Z`) - Date.parse(`${roastedOn}T00:00:00Z`)) / 86_400_000);
  if (days < 0) throw new InputError([`Tasted on ${tastedOn} is before the roast on ${roastedOn}. Check the date.`]);
  return days;
}

/**
 * Changes answers on a stored form. The changes are merged over the stored answers and the result
 * is checked as a whole form, so it stays exactly as valid as a new one; `extraCheck` can add rules
 * that need other rows. Only the answers named in `changes` are written (an answer of null clears
 * an optional one), and the row is locked while it is read and written, so an update can't undo
 * another one made in between.
 */
async function updateForm(
  db: Db,
  table: "bean" | "tasting",
  id: number,
  fields: Field[],
  changes: Record<string, unknown>,
  notFound: string,
  extraCheck?: (row: Record<string, unknown>, values: Answers) => Promise<void>,
) {
  const read = async (lock: boolean) =>
    // to_jsonb gives dates as YYYY-MM-DD and numbers as numbers, the shapes the form expects.
    db.query<{ row: Record<string, unknown> }>(`select to_jsonb(t) as row from ${table} t where id = $1${lock ? " for update" : ""}`, [id]);
  return inTransaction(db, async () => {
    const r = await read(true);
    if (!r.rows.length) throw new InputError([notFound]);
    const values = checked(fields, { ...rowAsAnswers(fields, r.rows[0].row), ...changes });
    await extraCheck?.(r.rows[0].row, values);
    // Only fields the caller named; unknown names were already refused by the form check above.
    // Clearing a chips field stores an empty list: those columns can't be null.
    const named = fields.filter((f) => Object.hasOwn(changes, f.id));
    if (named.length)
      await db.query(`update ${table} set ${named.map((f, i) => `${fieldColumn(f.id)} = $${i + 2}`).join(", ")} where id = $1`, [id, ...named.map((f) => values[f.id] ?? (f.kind === "chips" ? [] : null))]);
    return (await read(false)).rows[0].row;
  });
}

/** Corrects or adds to a bean's intake answers. Versions already recorded are not changed. */
export async function updateBean(db: Db, input: { beanId: number; answers: Record<string, unknown> }) {
  checkedShape(input, BEAN_UPDATE_SHAPE);
  return updateForm(db, "bean", input.beanId, INTAKE_FIELDS, input.answers, `Bean ${input.beanId} doesn't exist.`);
}

/** Corrects or adds to a tasting, for example its "next time I want" chips. A new date can't fall before its roast. */
export async function updateTasting(db: Db, input: { tastingId: number; answers: Record<string, unknown> }) {
  checkedShape(input, TASTING_UPDATE_SHAPE);
  return updateForm(db, "tasting", input.tastingId, TASTING_FIELDS, input.answers, `Tasting ${input.tastingId} doesn't exist.`, async (row, values) => {
    const roast = await db.query<{ roasted_at: string | Date }>("select roasted_at from roast where id = $1", [row.roast_id]);
    restDays(roast.rows[0].roasted_at, values.tastedOn);
  });
}

export async function listBeans(db: Db) {
  const r = await db.query(
    `select b.id, b.name, b.process, b.goal,
            (select max(number) from profile_version v where v.bean_id = b.id) as versions,
            (select max(r.roasted_at) from roast r join profile_version v on v.id = r.version_id where v.bean_id = b.id) as last_roasted
       from bean b order by b.id`,
  );
  return r.rows.map((b) => ({ id: Number(b.id), name: b.name, process: b.process, goal: b.goal, versions: Number(b.versions), lastRoasted: b.last_roasted ?? undefined }));
}

/** Everything about one bean, version by version, for reviewing progress and deciding the next change. */
export async function beanHistory(db: Db, beanId: number) {
  // to_jsonb gives dates as YYYY-MM-DD text and numerics as numbers through any Postgres driver
  // (node-pg would otherwise turn a date into a local-midnight Date, a day early west of UTC).
  const b = await db.query<{ bean: Record<string, unknown> }>("select to_jsonb(b) as bean from bean b where id = $1", [beanId]);
  if (!b.rows.length) throw new InputError([`Bean ${beanId} doesn't exist.`]);
  const versions = (await db.query(`${VERSION_SELECT} where v.bean_id = $1 order by v.number`, [beanId])).rows.map(toVersion);
  const roasts = (
    await db.query(
      `select r.id, r.version_id, r.roasted_at, r.log_profile_name, r.log_level, r.green_g, r.roasted_g, r.weight_loss_pct,
              r.cracks_pressed_ok, r.colour, r.looks, r.features
         from roast r join profile_version v on v.id = r.version_id where v.bean_id = $1 order by r.roasted_at, r.id`,
      [beanId],
    )
  ).rows;
  const tastings = (
    await db.query(
      `select t.id, t.roast_id, t.tasted_on::text as tasted_on, t.brew, t.score, t.taste, t.want_next, t.notes
         from tasting t join roast r on r.id = t.roast_id join profile_version v on v.id = r.version_id
        where v.bean_id = $1 order by t.tasted_on, t.id`,
      [beanId],
    )
  ).rows;
  return {
    bean: b.rows[0].bean,
    versions: versions.map((v) => ({
      ...v,
      roasts: roasts
        .filter((r) => Number(r.version_id) === v.id)
        .map((r) => {
          const f = r.features as RoastFeatures | null;
          return {
            id: Number(r.id),
            roastedAt: r.roasted_at,
            logProfileName: r.log_profile_name ?? undefined,
            logLevel: num(r.log_level),
            greenG: Number(r.green_g),
            roastedG: Number(r.roasted_g),
            weightLossPct: Number(r.weight_loss_pct),
            cracksPressedOk: r.cracks_pressed_ok ?? undefined,
            colour: num(r.colour),
            looks: r.looks,
            features: f
              ? { totalTime: f.totalTime, dropTemp: f.dropTemp, firstCrack: f.firstCrack, developmentRatio: f.developmentRatio, developmentDeltaT: f.developmentDeltaT, rorShape: f.ror.shape, thermalDose: f.thermalDose, dataWarnings: f.dataWarnings }
              : undefined,
            tastings: tastings
              .filter((t) => Number(t.roast_id) === Number(r.id))
              .map((t) => ({ id: Number(t.id), tastedOn: t.tasted_on, brew: t.brew, score: Number(t.score), taste: t.taste, wantNext: t.want_next, notes: t.notes ?? undefined })),
          };
        }),
    })),
  };
}
