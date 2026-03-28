// ═══════════════════════════════════════════════════════
// Gym Schedule Tracker
// ═══════════════════════════════════════════════════════
//
// Stores workout routines with exercises, sets, reps, and notes.
// Users can view today's workout, update routines, and get reminders.

import { db } from "../memory/db.js";

// ── Schema ────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS gym_routines (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    day_of_week INTEGER NOT NULL,           -- 0=Sunday, 1=Monday, ..., 6=Saturday
    workout_name TEXT   NOT NULL,
    exercises    TEXT   NOT NULL,            -- JSON array of {name, sets, reps, notes}
    is_active    INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT   NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT   NOT NULL DEFAULT (datetime('now')),
    UNIQUE(day_of_week)
  );
  CREATE INDEX IF NOT EXISTS idx_gym_day ON gym_routines(day_of_week, is_active);
`);

export interface Exercise {
    name: string;
    sets?: number;
    reps?: string;  // Can be "10-12" or "15" or "to failure"
    notes?: string;
}

export interface GymRoutine {
    id: number;
    day_of_week: number;
    workout_name: string;
    exercises: Exercise[];
    is_active: number;
}

// ── CRUD Operations ───────────────────────────────────

export function getRoutineForDay(dayOfWeek: number): GymRoutine | null {
    const row = db.prepare(`
        SELECT id, day_of_week, workout_name, exercises, is_active
        FROM gym_routines
        WHERE day_of_week = ? AND is_active = 1
    `).get(dayOfWeek) as any;

    if (!row) return null;

    return {
        ...row,
        exercises: JSON.parse(row.exercises),
    };
}

export function getTodayWorkout(): GymRoutine | null {
    const today = new Date().getDay(); // 0=Sunday, 1=Monday, etc.
    return getRoutineForDay(today);
}

export function getAllRoutines(): GymRoutine[] {
    const rows = db.prepare(`
        SELECT id, day_of_week, workout_name, exercises, is_active
        FROM gym_routines
        WHERE is_active = 1
        ORDER BY day_of_week ASC
    `).all() as any[];

    return rows.map(row => ({
        ...row,
        exercises: JSON.parse(row.exercises),
    }));
}

export function setRoutineForDay(
    dayOfWeek: number,
    workoutName: string,
    exercises: Exercise[]
): void {
    const exercisesJson = JSON.stringify(exercises);

    db.prepare(`
        INSERT INTO gym_routines (day_of_week, workout_name, exercises, updated_at)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(day_of_week) DO UPDATE SET
            workout_name = excluded.workout_name,
            exercises = excluded.exercises,
            updated_at = datetime('now')
    `).run(dayOfWeek, workoutName, exercisesJson);
}

export function deleteRoutineForDay(dayOfWeek: number): boolean {
    const result = db.prepare(`
        DELETE FROM gym_routines WHERE day_of_week = ?
    `).run(dayOfWeek);

    return result.changes > 0;
}

export function updateRoutineExercises(dayOfWeek: number, exercises: Exercise[]): boolean {
    const exercisesJson = JSON.stringify(exercises);

    const result = db.prepare(`
        UPDATE gym_routines
        SET exercises = ?, updated_at = datetime('now')
        WHERE day_of_week = ?
    `).run(exercisesJson, dayOfWeek);

    return result.changes > 0;
}

// ── Formatting ────────────────────────────────────────

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function formatRoutine(routine: GymRoutine): string {
    const dayName = DAY_NAMES[routine.day_of_week];
    const lines = [`💪 **${dayName}**: ${routine.workout_name}\n`];

    routine.exercises.forEach((ex, i) => {
        const setsReps = ex.sets && ex.reps ? `${ex.sets} × ${ex.reps}` : "";
        const notes = ex.notes ? ` — ${ex.notes}` : "";
        lines.push(`${i + 1}. ${ex.name}${setsReps ? ` (${setsReps})` : ""}${notes}`);
    });

    return lines.join("\n");
}

export function formatAllRoutines(): string {
    const routines = getAllRoutines();

    if (routines.length === 0) {
        return "📅 No gym routines set yet. Use the gym tools to create your schedule!";
    }

    return "📅 **Your Weekly Gym Schedule**:\n\n" +
        routines.map(formatRoutine).join("\n\n");
}
