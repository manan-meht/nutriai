import type { SupabaseClient } from "@supabase/supabase-js";

// An in-memory stand-in for the Guidance tables, shared by the guidance
// test suites. Not a *.test.ts file, so jest does not run it on its own.
//
// It enforces the constraints from migration 0068 that the service code has
// to live with, and returns Postgres's error codes when one is broken. A fake
// that accepts every write cannot catch a write that the real database
// refuses. Before this, a same-day re-activation looked fine in tests and
// failed silently in production. A test can also make any write fail on
// demand, to check that the failure is reported rather than swallowed.

export type Row = Record<string, unknown>;

export interface GuidanceRows {
  adults_contacts: Row[];
  gym_clients: Row[];
  nutrition_policy_versions: Row[];
  nutrition_guidance: Row[];
  nutrition_guidance_screening: Row[];
  nutrition_targets: Row[];
  meal_logs: Row[];
  /** Weight readings, for goal tracking. Optional: absent means none. */
  food_balance_weight_entries?: Row[];
  biomarker_logs?: Row[];
  /** Migration 0070. Optional: absent means none. */
  nutrition_meal_plans?: Row[];
  nutrition_meal_skips?: Row[];
  nutrition_habits?: Row[];
  /** Migration 0071. Optional: absent means none. */
  nutrition_household_facts?: Row[];
  nutrition_confirmed_products?: Row[];
  supplement_schedules?: Row[];
  supplement_doses?: Row[];
  meal_nutrient_estimates?: Row[];
  meal_nutrient_facts?: Row[];
  /** Account owners, for the preview whitelist (release.ts). */
  profiles?: Row[];
}

type Table = keyof GuidanceRows;

/** "<table>.<insert|upsert|update>" names a write to fail, e.g.
 * "nutrition_targets.insert". Mutable: push to it mid-test. */
export type FailingWrites = string[];

type DbError = { message: string; code: string };
type Result = { data: unknown; error: DbError | null };

/** The tables 0069 and 0070 let point at either kind of tracked person. */
const SUBJECT_TABLES: Table[] = [
  "nutrition_guidance",
  "nutrition_guidance_screening",
  "nutrition_targets",
  "nutrition_meal_plans",
  "nutrition_meal_skips",
  "nutrition_habits",
];
const CHANNELS = ["self_account", "end_user_session", "whatsapp", "caregiver", "coach"];
const SLOTS = ["breakfast", "lunch", "snack", "dinner"];

/** Duplicate keys among `rows` for `key`, as a unique index would see them. */
function duplicated(rows: Row[], key: (r: Row) => string): boolean {
  const keys = rows.map(key);
  return new Set(keys).size !== keys.length;
}

/** One tracked person, whichever column names them. */
const subjectOf = (r: Row) => (r.adults_contact_id != null ? `a:${r.adults_contact_id}` : `g:${r.gym_client_id}`);

/** The checks in 0068 and 0069 a write could actually break, for the rows of
 * one table after the write. Returns the error Postgres would raise. */
function violation(table: Table, after: Row[]): DbError | null {
  if (SUBJECT_TABLES.includes(table)) {
    for (const r of after) {
      if ((r.adults_contact_id == null) === (r.gym_client_id == null)) {
        return { code: "23514", message: `new row violates check constraint "${table}_one_subject"` };
      }
    }
  }
  if (table === "nutrition_targets") {
    for (const r of after) {
      if (r.effective_to != null && !(String(r.effective_to) > String(r.effective_from))) {
        return { code: "23514", message: 'new row violates check constraint "nutrition_targets_effective_range"' };
      }
    }
    const open = after.filter((r) => r.effective_to == null).map(subjectOf);
    if (new Set(open).size !== open.length) {
      return { code: "23505", message: 'duplicate key value violates unique constraint "nutrition_targets_one_current_idx"' };
    }
  }
  if (table === "nutrition_meal_plans") {
    for (const r of after) {
      if (!SLOTS.includes(String(r.meal_slot))) return { code: "23514", message: 'violates check constraint "nutrition_meal_plans_meal_slot_check"' };
      if (!["planned", "cancelled"].includes(String(r.status ?? "planned"))) return { code: "23514", message: 'violates check constraint "nutrition_meal_plans_status_check"' };
      if (!CHANNELS.includes(String(r.planned_via))) return { code: "23514", message: 'violates check constraint "nutrition_meal_plans_planned_via_check"' };
    }
    if (duplicated(after.filter((r) => (r.status ?? "planned") !== "cancelled"), (r) => `${subjectOf(r)}:${r.local_date}:${r.meal_slot}`)) {
      return { code: "23505", message: 'duplicate key value violates unique constraint "nutrition_meal_plans_one_live_adults_idx"' };
    }
  }
  if (table === "nutrition_meal_skips") {
    for (const r of after) {
      if (!SLOTS.includes(String(r.meal_slot))) return { code: "23514", message: 'violates check constraint "nutrition_meal_skips_meal_slot_check"' };
      if (!CHANNELS.includes(String(r.confirmed_via))) return { code: "23514", message: 'violates check constraint "nutrition_meal_skips_confirmed_via_check"' };
    }
    if (duplicated(after, (r) => `${subjectOf(r)}:${r.local_date}:${r.meal_slot}`)) {
      return { code: "23505", message: 'duplicate key value violates unique constraint "nutrition_meal_skips_adults_unique"' };
    }
  }
  if (table === "nutrition_habits") {
    for (const r of after) {
      if (new Date(`${r.week_start}T12:00:00Z`).getUTCDay() !== 1) return { code: "23514", message: 'violates check constraint "nutrition_habits_week_start_check"' };
      if (!CHANNELS.includes(String(r.chosen_via))) return { code: "23514", message: 'violates check constraint "nutrition_habits_chosen_via_check"' };
    }
    if (duplicated(after.filter((r) => (r.status ?? "active") === "active"), (r) => `${subjectOf(r)}:${r.week_start}`)) {
      return { code: "23505", message: 'duplicate key value violates unique constraint "nutrition_habits_one_active_adults_idx"' };
    }
  }
  if (table === "supplement_doses" && duplicated(after, (r) => `${r.schedule_id}:${r.taken_on}:${r.slot}`)) {
    return { code: "23505", message: 'duplicate key value violates unique constraint "supplement_doses_once_per_slot"' };
  }
  if (table === "supplement_schedules") {
    for (const r of after) {
      if (r.effective_to != null && !(String(r.effective_to) > String(r.effective_from))) {
        return { code: "23514", message: 'new row violates check constraint "supplement_schedules_range"' };
      }
    }
  }
  if (table === "nutrition_guidance") {
    for (const r of after) {
      const meals = r.meals_per_day;
      if (meals != null && (typeof meals !== "number" || meals < 1 || meals > 8)) {
        return { code: "23514", message: 'new row violates check constraint "nutrition_guidance_meals_per_day_check"' };
      }
    }
  }
  return null;
}

export function makeGuidanceDb(rows: GuidanceRows, failing: FailingWrites = []): SupabaseClient {
  /** A table's rows, creating an optional table on first use. */
  const tableRows = (table: Table): Row[] => (rows[table] ??= []);
  function injected(table: Table, op: string): DbError | null {
    return failing.includes(`${table}.${op}`) ? { code: "08006", message: `injected ${table}.${op} failure` } : null;
  }

  /** Applies `next` as the table's new contents if nothing is broken. */
  function commit(table: Table, op: string, next: Row[]): Result {
    const error = injected(table, op) ?? violation(table, next);
    if (!error) tableRows(table).splice(0, tableRows(table).length, ...next);
    return { data: null, error };
  }

  function query(table: Table) {
    let working = tableRows(table);
    const chain = {
      select: () => chain,
      eq: (col: string, val: unknown) => {
        working = working.filter((r) => r[col] === val);
        return chain;
      },
      is: (col: string, val: unknown) => {
        working = working.filter((r) => (r[col] ?? null) === val);
        return chain;
      },
      gte: (col: string, val: string) => {
        working = working.filter((r) => String(r[col]) >= val);
        return chain;
      },
      in: (col: string, vals: unknown[]) => {
        working = working.filter((r) => vals.includes(r[col]));
        return chain;
      },
      limit: (n: number) => {
        working = working.slice(0, n);
        return chain;
      },
      maybeSingle: () => Promise.resolve({ data: working[0] ?? null, error: null }),
      then: (resolve: (v: Result) => void) => resolve({ data: working, error: null }),
    };
    return chain;
  }

  return {
    from: (table: Table) => ({
      select: () => query(table),
      insert: (row: Row) => {
        // Runs once, whether awaited directly or through .select().single().
        const inserted = { id: `${table}-${tableRows(table).length + 1}`, ...row };
        let result: Result | null = null;
        const exec = () => (result ??= commit(table, "insert", [...tableRows(table), inserted]));
        return {
          then: (resolve: (v: Result) => void, reject?: (e: unknown) => void) => Promise.resolve(exec()).then(resolve, reject),
          select: () => ({
            single: () => {
              const r = exec();
              return Promise.resolve(r.error ? { data: null, error: r.error } : { data: inserted, error: null });
            },
          }),
        };
      },
      upsert: (row: Row, opts?: { onConflict?: string; ignoreDuplicates?: boolean }) => {
        // ON CONFLICT on the columns named, as PostgREST does. A row whose
        // conflict column is null never matches, as with a real unique key.
        const keys = (opts?.onConflict ?? "adults_contact_id").split(",").map((k) => k.trim());
        const idx = keys.some((k) => row[k] == null) ? -1 : tableRows(table).findIndex((r) => keys.every((k) => r[k] === row[k]));
        if (idx >= 0 && opts?.ignoreDuplicates) return Promise.resolve({ data: null, error: injected(table, "upsert") });
        const next = [...tableRows(table)];
        if (idx >= 0) next[idx] = { ...next[idx], ...row };
        else next.push({ ...row });
        return Promise.resolve(commit(table, "upsert", next));
      },
      delete: () => {
        const filters: Array<(r: Row) => boolean> = [];
        const chain = {
          eq: (col: string, val: unknown) => {
            filters.push((r) => r[col] === val);
            return chain;
          },
          then: (resolve: (v: Result) => void) => {
            const error = injected(table, "delete");
            if (!error) {
              const keep = tableRows(table).filter((r) => !filters.every((f) => f(r)));
              tableRows(table).splice(0, tableRows(table).length, ...keep);
            }
            return resolve({ data: null, error });
          },
        };
        return chain;
      },
      update: (patch: Row) => {
        const filters: Array<(r: Row) => boolean> = [];
        const chain = {
          eq: (col: string, val: unknown) => {
            filters.push((r) => r[col] === val);
            return chain;
          },
          is: (col: string, val: unknown) => {
            filters.push((r) => (r[col] ?? null) === val);
            return chain;
          },
          then: (resolve: (v: Result) => void) => {
            const matches = (r: Row) => filters.every((f) => f(r));
            // Rows are patched in place on success, so a test holding a
            // reference to one sees the change, as it did before.
            const next = tableRows(table).map((r) => (matches(r) ? { ...r, ...patch } : r));
            const error = injected(table, "update") ?? violation(table, next);
            if (!error) tableRows(table).forEach((r) => matches(r) && Object.assign(r, patch));
            return resolve({ data: null, error });
          },
        };
        return chain;
      },
    }),
  } as unknown as SupabaseClient;
}
