import type { NativeGoal, NativeGoalsState } from "./types.js";

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const status = (value: unknown): value is NativeGoal["status"] => typeof value === "string" && ["draft", "running", "checking", "reporting", "waiting", "paused", "completed", "cancelled"].includes(value);

/** Only the existing footer's presentation header. The complete native document stays in the raw view. */
export function nativeGoalsView(value: unknown): NativeGoalsState | undefined {
  if (value === null || value === undefined) return { goals: {} };
  if (!record(value) || !record(value.goals)) return undefined;
  const entries: [string, NativeGoal][] = [];
  for (const [id, raw] of Object.entries(value.goals)) {
    if (!id || !record(raw) || raw.id !== id || typeof raw.objective !== "string" || !status(raw.status) ||
        !count(raw.createdAt) || !count(raw.updatedAt) || raw.updatedAt < raw.createdAt || !count(raw.revision) ||
        !count(raw.callsUsed) || !count(raw.activeMsUsed)) return undefined;
    let limits: NativeGoal["limits"] = "none";
    if (raw.limits !== "none") {
      if (!record(raw.limits)) return undefined;
      limits = {};
      for (const key of ["maxCalls", "activeMs", "tokens"] as const) {
        const bound = raw.limits[key];
        if (bound === undefined) continue;
        if (!count(bound) || bound <= 0) return undefined;
        limits[key] = bound;
      }
    }
    const goal: NativeGoal = { id, objective: raw.objective, status: raw.status, limits, createdAt: raw.createdAt, updatedAt: raw.updatedAt,
      revision: raw.revision, callsUsed: raw.callsUsed, activeMsUsed: raw.activeMsUsed };
    entries.push([id, goal]);
  }
  const goals = Object.fromEntries(entries);
  if (value.active !== undefined && (typeof value.active !== "string" || !Object.hasOwn(goals, value.active))) return undefined;
  return { goals, ...(typeof value.active === "string" ? { active: value.active } : {}) };
}

/** Same active/failed counts as the selected footer; these values never control execution. */
export function scheduleView(value: unknown): { scheduled: number; failed: number } | undefined {
  if (value === null || value === undefined) return { scheduled: 0, failed: 0 };
  if (!record(value) || !record(value.items)) return undefined;
  let scheduled = 0, failed = 0;
  for (const item of Object.values(value.items)) {
    if (!record(item) || typeof item.status !== "string" || !["active", "completed", "cancelled", "failed"].includes(item.status)) return undefined;
    if (item.status === "active") scheduled++;
    if (item.status === "failed") failed++;
  }
  return { scheduled, failed };
}
