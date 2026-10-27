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
  nutrition_policy_versions: Row[];
  nutrition_guidance: Row[];
  nutrition_guidance_screening: Row[];
  nutrition_targets: Row[];
  meal_logs: Row[];
}

type Table = keyof GuidanceRows;

/** "<table>.<insert|upsert|update>" names a write to fail, e.g.
 * "nutrition_targets.insert". Mutable: push to it mid-test. */
export type FailingWrites = string[];

type DbError = { message: string; code: string };
type Result = { data: unknown; error: DbError | null };

/** The checks in 0068 a write could actually break, for the rows of one
 * table after the write. Returns the error Postgres would raise. */
function violation(table: Table, after: Row[]): DbError | null {
  if (table === "nutrition_targets") {
    for (const r of after) {
      if (r.effective_to != null && !(String(r.effective_to) > String(r.effective_from))) {
        return { code: "23514", message: 'new row violates check constraint "nutrition_targets_effective_range"' };
      }
    }
    const open = after.filter((r) => r.effective_to == null).map((r) => r.adults_contact_id);
    if (new Set(open).size !== open.length) {
      return { code: "23505", message: 'duplicate key value violates unique constraint "nutrition_targets_one_current_idx"' };
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
  function injected(table: Table, op: string): DbError | null {
    return failing.includes(`${table}.${op}`) ? { code: "08006", message: `injected ${table}.${op} failure` } : null;
  }

  /** Applies `next` as the table's new contents if nothing is broken. */
  function commit(table: Table, op: string, next: Row[]): Result {
    const error = injected(table, op) ?? violation(table, next);
    if (!error) rows[table].splice(0, rows[table].length, ...next);
    return { data: null, error };
  }

  function query(table: Table) {
    let working = rows[table];
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
      maybeSingle: () => Promise.resolve({ data: working[0] ?? null, error: null }),
      then: (resolve: (v: Result) => void) => resolve({ data: working, error: null }),
    };
    return chain;
  }

  return {
    from: (table: Table) => ({
      select: () => query(table),
      insert: (row: Row) =>
        Promise.resolve(commit(table, "insert", [...rows[table], { id: `${table}-${rows[table].length + 1}`, ...row }])),
      upsert: (row: Row) => {
        const idx = rows[table].findIndex((r) => r.adults_contact_id === row.adults_contact_id);
        const next = [...rows[table]];
        if (idx >= 0) next[idx] = { ...next[idx], ...row };
        else next.push({ ...row });
        return Promise.resolve(commit(table, "upsert", next));
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
            const next = rows[table].map((r) => (matches(r) ? { ...r, ...patch } : r));
            const error = injected(table, "update") ?? violation(table, next);
            if (!error) rows[table].forEach((r) => matches(r) && Object.assign(r, patch));
            return resolve({ data: null, error });
          },
        };
        return chain;
      },
    }),
  } as unknown as SupabaseClient;
}
