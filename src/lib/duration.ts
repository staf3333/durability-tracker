import type { Session } from '../types';

export const WORKOUT_IDLE_CAP_SECONDS = 30 * 60;
export const LEGACY_ACTIVE_CAP_SECONDS = 3 * 60 * 60;

export function secondsBetween(start?: string, end?: string) {
  if (!start || !end) return 0;
  return Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / 1000));
}

export function cappedActivitySeconds(start?: string, end?: string) {
  return Math.min(secondsBetween(start, end), WORKOUT_IDLE_CAP_SECONDS);
}

export function workoutElapsedSeconds(session: Session | undefined, now = Date.now()) {
  if (!session?.startedAt) return 0;
  if (session.activeSeconds != null) {
    if (session.completedAt || !session.lastActiveAt) return session.activeSeconds;
    const live = Math.max(0, Math.round((now - Date.parse(session.lastActiveAt)) / 1000));
    return session.activeSeconds + Math.min(live, WORKOUT_IDLE_CAP_SECONDS);
  }

  const end = session.completedAt
    ?? (now - Date.parse(session.updatedAt) > WORKOUT_IDLE_CAP_SECONDS * 1000
      ? session.updatedAt
      : new Date(now).toISOString());
  return secondsBetween(session.startedAt, end);
}
