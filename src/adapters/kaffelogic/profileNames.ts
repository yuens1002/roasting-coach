// How the tool names the profile files it writes (decided 2026-10-11, docs/ROADMAP.md, Next 5). Two names, each with its job:
//
//   short name   YIRG-003-1r1                 what the machine and Kaffelogic Studio show; at most 15 characters, because
//                                             Studio cuts a longer one at 15 (measured 2026-10-11: "KLN7-YGRG-WSH-001-3r1"
//                                             showed as "KLN7-YGRG-WSH-0", losing the bean and version that tell profiles apart)
//   file name    KLN7-YIRG-WSH-003-1r1.kpro   free length: manufacturer and model, origin, processing, bean number, version
//                                             and revision. The log records it beside the short name (profile_file_name).
//
// The origin is the first four letters of the last part of the intake's origin text ("Ethiopia, Yirgacheffe" is YIRG; write the
// country first and the region last), the bean's name when there is no origin. The bean number is the bean's id, up to 999. The
// version is the bean's version number. The revision is which curve the bean's profile has: it bumps only when the curve changes,
// and a level-only version keeps it. Nothing here asks the roaster for a name.
import type { Intake } from "../../core/intake.js";
import { MACHINE_ID } from "./startingProfiles.js";

/** The longest short name Studio shows whole. */
export const MAX_SHORT_NAME = 15;

/** The manufacturer (two letters) and model (two characters) of each machine the tool writes profiles for. */
export const MACHINE_CODES: Record<string, string> = { [MACHINE_ID]: "KLN7" };

export const PROCESS_CODES = {
  washed: "WSH",
  natural: "NAT",
  honey: "HON",
  anaerobic: "ANA",
  "wet-hulled": "WHL",
  unknown: "UNK",
} as const satisfies Record<Intake["process"], string>;

const LIMITS = { beanId: 999, version: 99, revision: 99 } as const;

/** Letters only, upper case, accents taken off: "Yirgacheffé" is "YIRGACHEFFE". */
const letters = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").replace(/[^A-Za-z]/g, "").toUpperCase();

/** A part of the origin text names a place when it has at least this many letters ("1900m" and "b" do not). */
const MIN_ORIGIN_LETTERS = 3;

/**
 * The four letters that name where the coffee is from: the last part of the origin text that has at least three letters (so
 * "Ethiopia, 1900m" is ETHI), else the first four letters of the bean's name, else BEAN. Only Latin letters count, accents off.
 */
export function originCode(origin: string | undefined, beanName: string): string {
  const parts = (origin ?? "").split(",").map(letters).filter((part) => part.length >= MIN_ORIGIN_LETTERS);
  return (parts[parts.length - 1] ?? letters(beanName)).slice(0, 4) || "BEAN";
}

export interface ProfileNameParts {
  beanId: number;
  beanName: string;
  /** The intake's origin text, when it has one. */
  origin?: string;
  process: Intake["process"];
  /** The bean's version number the file is for. */
  version: number;
  /** Which curve the bean's profile has at that version (profileRevision). */
  revision: number;
  machineId?: string;
}

/** The short name and the file name for a written profile. Throws, in plain words, when a number is past what the names have room for. */
export function profileNames(parts: ProfileNameParts): { shortName: string; fileName: string } {
  for (const [key, label] of [["beanId", "bean number"], ["version", "version"], ["revision", "revision"]] as const) {
    const value = parts[key];
    if (!Number.isInteger(value) || value < 1 || value > LIMITS[key]) throw new Error(`A profile name has room for a ${label} from 1 to ${LIMITS[key]}; got ${value}.`);
  }
  const machine = MACHINE_CODES[parts.machineId ?? MACHINE_ID];
  if (!machine) throw new Error(`No profile name code for the machine "${parts.machineId}".`);
  const origin = originCode(parts.origin, parts.beanName);
  const number = `${String(parts.beanId).padStart(3, "0")}-${parts.version}r${parts.revision}`;
  const shortName = `${origin}-${number}`;
  // Cannot happen with the limits above (the longest is YIRG-999-99r99, 14), and keeps the 15-character limit true if a limit is raised.
  if (shortName.length > MAX_SHORT_NAME) throw new Error(`The profile short name "${shortName}" is longer than the ${MAX_SHORT_NAME} characters the machine shows.`);
  return { shortName, fileName: `${machine}-${origin}-${PROCESS_CODES[parts.process]}-${number}.kpro` };
}

/** The part of a bean's history a revision is worked out from. */
interface RevisionVersion {
  number: number;
  profileName: string;
  baseProfile?: string;
  /** A fingerprint of the version's stored profile body (profileBodyKey), when it has one. */
  profileKey?: string;
  /**
   * The stock profile whose curve this version's stored body is, when the caller has checked it body to body against the
   * roaster's copy of that stock profile. `baseProfile` cannot say it: a version keeps pointing at its stock profile through any
   * number of edits.
   */
  stockBody?: string;
}

/**
 * Which curve a version has, counted from 1 in the order the bean first used them: the same curve keeps its number, a different
 * one takes the next, and a level-only version keeps it. A version whose body is a stock profile's (`stockBody`), or that has no
 * stored profile yet and is that stock profile, is that stock curve; one with a stored body is identified by its fingerprint; one
 * under a name of its own with no stored body is a curve of its own.
 */
export function profileRevision(versions: readonly RevisionVersion[], number: number): number {
  const ordered = [...versions].sort((a, b) => a.number - b.number).filter((v) => v.number <= number);
  const identity = new Map<number, string>();
  const curves: string[] = [];
  for (const v of ordered) {
    const base = v.baseProfile ?? v.profileName;
    const named = v.baseProfile !== undefined && v.profileName !== v.baseProfile;
    const id = v.stockBody !== undefined ? `stock:${v.stockBody}` : (v.profileKey ?? (named ? `name:${v.profileName}` : `stock:${base}`));
    identity.set(v.number, id);
    if (!curves.includes(id)) curves.push(id);
  }
  const own = identity.get(number);
  if (own === undefined) throw new Error(`The bean has no version ${number}.`);
  return curves.indexOf(own) + 1;
}
