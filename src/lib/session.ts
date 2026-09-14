import type { Block, Exercise, Session, Store } from '../types';
import { lastPerformance, setsOf, summarisePast } from '../lib/plan';


export interface FlatExercise {
  ex: Exercise;
  block: Block;
  blockIndex: number;
  /** Position in the whole session, for next/previous navigation. */
  index: number;
}

/** The session flattened into the order it is performed. */
export function flatten(blocks: Block[]): FlatExercise[] {
  const out: FlatExercise[] = [];
  blocks.forEach((block, blockIndex) => {
    block.exercises.forEach((ex) => {
      out.push({ ex, block, blockIndex, index: out.length });
    });
  });
  return out;
}

/** "3 sets · 6 reps · 75 lb" — the prescription, with logged load if there is one. */
export function prescription(ex: Exercise, session: Session | undefined) {
  const sets = setsOf(session, ex);
  const parts = [`${sets.length} set${sets.length === 1 ? '' : 's'}`, ex.target];
  const load = sets.map((s) => s.load).find(Boolean);
  if (load) parts.push(`${load} lb`);
  else if (ex.weight) parts.push('— lb');
  return parts.join(' · ');
}

export function progress(ex: Exercise, session: Session | undefined) {
  const sets = setsOf(session, ex);
  return { done: sets.filter((s) => s.done).length, total: sets.length };
}

export function lastLine(store: Store, date: string, exId: string) {
  const past = lastPerformance(store, date, exId);
  if (!past) return null;
  return { label: past.imported ? 'PJF' : 'last', text: summarisePast(past), date: past.date };
}

const allDone = (session: Session | undefined, ex: Exercise) => {
  const sets = setsOf(session, ex);
  return sets.length > 0 && sets.every((x) => x.done);
};

/** True when every exercise in the block has all its sets ticked. */
export function blockComplete(block: Block, session: Session | undefined) {
  return block.exercises.every((ex) => allDone(session, ex));
}

/**
 * Where "next" goes.
 *
 * A superset is performed A1, B1, A2, B2 — so inside a group, next cycles
 * through the members and wraps back to the first until the whole group is
 * finished. Walking straight out of the group after one pass would make you
 * navigate backwards for every subsequent round.
 */
export function nextIndex(
  flat: FlatExercise[], current: number, session: Session | undefined,
): number | null {
  const cur = flat[current];
  if (!cur) return null;

  if (cur.block.mode !== 'straight') {
    if (!blockComplete(cur.block, session)) {
      const members = flat.filter((f) => f.blockIndex === cur.blockIndex);
      const pos = members.findIndex((m) => m.index === current);
      // Next member with work left, wrapping within the group.
      for (let step = 1; step <= members.length; step++) {
        const candidate = members[(pos + step) % members.length];
        if (!allDone(session, candidate.ex)) return candidate.index;
      }
    }
    // Group finished: step out of it entirely rather than back to the top.
    const after = flat.find((f) => f.index > current && f.blockIndex !== cur.blockIndex);
    return after ? after.index : null;
  }

  // Straight blocks simply advance in order, block-mates included.
  return current + 1 < flat.length ? current + 1 : null;
}

export const prevIndex = (current: number) => (current > 0 ? current - 1 : null);
