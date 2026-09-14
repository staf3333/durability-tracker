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
