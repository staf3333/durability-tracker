export type BlockMode = 'straight' | 'superset' | 'circuit';
export type LoadUnit = 'lb' | 'kg';
export type DistanceUnit = 'm' | 'km' | 'mi';

export interface Exercise {
  /** Stable storage key. Changing this orphans previously logged sets. */
  id: string;
  name: string;
  /** PJF exercise slug, appended to the exercise base URL. */
  slug?: string;
  /** Default number of set rows (or rounds, inside a group). */
  sets: number;
  /** Human-readable target, e.g. "8–12 ea" or "0:45". */
  target: string;
  note?: string;
  /** Shows a load field. */
  weight?: boolean;
  /** Default display unit for load. */
  loadUnit?: LoadUnit;
  /** Shows a distance field. */
  distance?: boolean;
  /** Unit used by the distance field. */
  distanceUnit?: DistanceUnit;
  /** Work duration in seconds — renders a countdown for the set itself. */
  seconds?: number;
  /** Rest in seconds, used by the rest timer. */
  rest?: number;
  priority?: boolean;
  optional?: boolean;
  side?: 'R' | 'L';
}

export interface Block {
  title: string;
  mode: BlockMode;
  exercises: Exercise[];
}

export interface Template {
  name: string;
  sub: string;
  note: string;
  blocks: Block[];
}

export interface PlannedWorkout extends Template {
  /** Stable identity within one calendar day/template. */
  id: string;
  day: string;
}

export interface SetEntry {
  /** Reps, or a formatted duration for timed sets. */
  reps: string;
  load: string;
  /** Missing on legacy entries and therefore interpreted as lb. */
  loadUnit?: LoadUnit;
  distance?: string;
  distanceUnit?: DistanceUnit;
  done: boolean;
}

export type Status = 'green' | 'yellow' | 'red';

export interface Readiness {
  ktwR: number | null;
  ktwL: number | null;
  anklePain: number | null;
  tendonPain: number | null;
  amStiff: number | null;
  swelling: 'yes' | 'no';
  notes: string;
  status: Status;
}

export interface Session {
  /** Stable sync/export identifier. Legacy workouts may keep their date key. */
  id?: string;
  /** Calendar date, independent from the stable workout record id. */
  date?: string;
  /** Stable planned workout identity within the day template. */
  workoutId?: string;
  /** Legacy generic label retained only so pre-release v5 data can migrate. */
  name?: string;
  /** Which template was performed. */
  day: string;
  readiness: Readiness | null;
  /** exerciseId -> one entry per set/round. */
  exercises: Record<string, SetEntry[]>;
  notes: string;
  /** Device clock at the time of the edit. Decides who wins a sync conflict. */
  updatedAt: string;
  /** First logged activity, used for the session clock. */
  startedAt?: string;
  /** Accumulated active time, excluding inactivity gaps over the idle cap. */
  activeSeconds?: number;
  /** Most recent work interaction used to resume the active-time clock. */
  lastActiveAt?: string;
  /** Workout record creation time, even before work begins. */
  createdAt?: string;
  /** Set when the session is locked in. Stops the clock and freezes inputs. */
  completedAt?: string;
  /** exerciseId -> note written during the session. */
  exerciseNotes?: Record<string, string>;
  /** exerciseId -> equipment/setup/variant used for this performance. */
  exerciseSetups?: Record<string, string>;
  /** Soft-delete tombstone, so a delete propagates instead of being resurrected. */
  deletedAt?: string;
}

export interface SyncState {
  userId: string | null;
  /** Server time from the last successful sync. Never a device clock. */
  lastSyncedAt: string | null;
  /** Session dates awaiting push. Explicit, because clock skew breaks derived dirtiness. */
  pending: Record<string, true>;
  lastError: string | null;
  /** The losing side of the most recent conflict, kept so it is never lost silently. */
  lastConflict?: { date: string; mine: Session } | null;
}

/** A prior performance imported from outside the app. Never a logged session. */
export interface HistoryEntry {
  date: string;
  source: string;
  sets: SetEntry[];
  note?: string;
  setup?: string;
  /** Earlier performances of the same exercise, newest first. Read-only. */
  archive?: Array<{ date: string; source: string; sets: SetEntry[]; note?: string; setup?: string }>;
}

/** User overrides for which fields an exercise tracks. */
export interface ExercisePref {
  /** Show a load field even when the template does not ask for one. */
  load?: boolean;
  /** Default unit for newly logged load. */
  loadUnit?: LoadUnit;
  /** Show a distance field. */
  distance?: boolean;
  /** Unit used for newly logged distance. */
  distanceUnit?: DistanceUnit;
  /** Work-timer duration in seconds; null removes a timer the template defines. */
  seconds?: number | null;
  /** Rest duration override in seconds; null removes rest for this exercise. */
  rest?: number | null;
}

export interface Store {
  version: 6;
  sessions: Record<string, Session>;
  /**
   * exerciseId -> last known performance from imported history. Feeds the
   * "last time" line only. Never rendered in History, never exported as a
   * logged session, always superseded by a real log.
   */
  history: Record<string, HistoryEntry>;
  sync: SyncState;
  /** exerciseId -> field overrides. Optional so older stores load unchanged. */
  prefs?: Record<string, ExercisePref>;
}
