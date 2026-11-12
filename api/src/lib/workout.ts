/** Legacy date keys and stable per-day planned workout record IDs. */
export const validWorkoutRecordId = (id: string) =>
  /^\d{4}-\d{2}-\d{2}(?:--[a-zA-Z0-9-]+)?$/.test(id);
