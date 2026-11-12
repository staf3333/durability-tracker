import { TEMPLATES } from './templates';
import type { PlannedWorkout, Session, Store } from '../types';

interface WorkoutDefinition {
  id: string;
  name: string;
  blockIndexes: number[];
  sub?: string;
  note?: string;
}

const DEFINITIONS: Record<string, WorkoutDefinition[]> = {
  mon: [
    { id: 'lower-a', name: 'Lower A', blockIndexes: [0, 1, 2, 3, 4, 5] },
  ],
  tue: [
    { id: 'shooting-wotw', name: 'Shooting / WOTW', blockIndexes: [0] },
    { id: 'daily-microdose', name: 'Daily microdose', blockIndexes: [1] },
    { id: 'upper-1', name: 'Upper 1', blockIndexes: [2] },
  ],
  wed: [
    { id: 'lower-b', name: 'Lower B', blockIndexes: [0, 1, 2] },
  ],
  thu: [
    { id: 'microdose', name: 'Microdose', blockIndexes: [0, 1] },
    { id: 'upper-2', name: 'Upper 2', blockIndexes: [2, 3, 4] },
  ],
  fri: [
    { id: 'basketball-shooting', name: 'Basketball / Shooting', blockIndexes: [0] },
  ],
  sat: [
    { id: 'basketball', name: 'Basketball', blockIndexes: [0] },
    { id: 'upper-3', name: 'Upper 3', blockIndexes: [1] },
  ],
  sun: [
    { id: 'recovery', name: 'Optional recovery', blockIndexes: [0] },
  ],
  dunk: [
    { id: 'dunk-ladder', name: 'Dunk Ladder', blockIndexes: [0, 1] },
  ],
};

export function plannedWorkouts(day: string): PlannedWorkout[] {
  const template = TEMPLATES[day];
  if (!template) return [];
  return (DEFINITIONS[day] ?? [{
    id: day,
    name: template.name,
    blockIndexes: template.blocks.map((_, index) => index),
  }]).map((definition) => ({
    id: definition.id,
    day,
    name: definition.name,
    sub: definition.sub ?? template.sub,
    note: definition.note ?? template.note,
    blocks: definition.blockIndexes.map((index) => template.blocks[index]).filter(Boolean),
  }));
}

export function plannedWorkout(day: string, workoutId?: string): PlannedWorkout {
  const workouts = plannedWorkouts(day);
  return workouts.find((workout) => workout.id === workoutId) ?? workouts[0];
}

export function defaultWorkoutId(day: string): string {
  return plannedWorkout(day).id;
}

export function workoutRecordId(date: string, workoutId: string): string {
  return `${date}--${workoutId}`;
}

export function sessionDate(id: string, session: Session): string {
  return session.date ?? id.slice(0, 10);
}

export function sessionsForDate(store: Store, date: string) {
  return Object.entries(store.sessions)
    .filter(([id, session]) => !session.deletedAt && sessionDate(id, session) === date)
    .sort((a, b) => {
      const aTime = a[1].startedAt ?? a[1].createdAt ?? a[1].updatedAt;
      const bTime = b[1].startedAt ?? b[1].createdAt ?? b[1].updatedAt;
      return aTime.localeCompare(bTime) || a[0].localeCompare(b[0]);
    });
}

export function workoutSession(
  store: Store, date: string, workoutId: string,
): [string, Session] | undefined {
  return sessionsForDate(store, date)
    .find(([, session]) => session.workoutId === workoutId);
}

export function workoutName(session: Session): string {
  return plannedWorkout(session.day, session.workoutId).name;
}

export function dateReadiness(store: Store, date: string) {
  return [...sessionsForDate(store, date)].reverse()
    .find(([, session]) => session.readiness)?.[1].readiness ?? null;
}

export function workoutExerciseIds(day: string, workoutId: string): Set<string> {
  return new Set(plannedWorkout(day, workoutId).blocks
    .flatMap((block) => block.exercises.map((exercise) => exercise.id)));
}
