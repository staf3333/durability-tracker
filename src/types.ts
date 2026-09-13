export type BlockMode = 'straight' | 'superset' | 'circuit';

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

export interface SetEntry {
  /** Reps, or a formatted duration for timed sets. */
  reps: string;
  load: string;
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
  /** Which template was performed. */
  day: string;
  readiness: Readiness | null;
  /** exerciseId -> one entry per set/round. */
  exercises: Record<string, SetEntry[]>;
  notes: string;
  /** Device clock at the time of the edit. Decides who wins a sync conflict. */
  updatedAt: string;
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
  /** Earlier performances of the same exercise, newest first. Read-only. */
  archive?: Array<{ date: string; source: string; sets: SetEntry[]; note?: string }>;
}

export interface Store {
  version: 4;
  sessions: Record<string, Session>;
  /**
   * exerciseId -> last known performance from imported history. Feeds the
   * "last time" line only. Never rendered in History, never exported as a
   * logged session, always superseded by a real log.
   */
  history: Record<string, HistoryEntry>;
  sync: SyncState;
}
