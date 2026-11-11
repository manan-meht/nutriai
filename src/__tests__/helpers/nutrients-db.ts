import type { SupabaseClient } from "@supabase/supabase-js";

// An in-memory stand-in for the tables the micronutrient pipeline reads and
// writes (0071, plus meal_logs). Not a *.test.ts file, so jest doesn't run
// it on its own.
//
// It enforces the unique keys 0071 declares, as Postgres would (a row with
// a null in a key column never conflicts), records every table touched so
// a test can prove a path made no database calls, and can fail any write
// on demand.

export type Row = Record<string, unknown>;
export type Tables = Record<string, Row[]>;

const UNIQUE_KEYS: Record<string, string[][]> = {
  meal_nutrient_estimates: [["meal_log_id"]],
  nutrition_household_facts: [
    ["adults_contact_id", "fact_key"],
    ["gym_client_id", "fact_key"],
  ],
  meal_nutrient_facts: [["meal_log_id"]],
  supplement_doses: [["schedule_id", "taken_on", "slot"]],
};

type Result = { data: unknown; error: { code: string; message: string } | null };

export interface FakeDb {
  db: SupabaseClient;
  tables: Tables;
  touched: string[];
  failing: string[];
}

export function makeNutrientsDb(initial: Partial<Tables> = {}): FakeDb {
  const tables: Tables = {};
  for (const [k, v] of Object.entries(initial)) tables[k] = (v ?? []).map((r) => ({ ...r }));
  const touched: string[] = [];
  const failing: string[] = [];
  const rows = (t: string) => (tables[t] ??= []);
  const fail = (t: string, op: string) => (failing.includes(`${t}.${op}`) ? { code: "08006", message: `injected ${t}.${op}` } : null);

  function conflicts(t: string, row: Row, keys: string[]): number {
    if (keys.some((k) => row[k] == null)) return -1;
    return rows(t).findIndex((r) => keys.every((k) => r[k] === row[k]));
  }

  function select(t: string) {
    let working = [...rows(t)];
    let single = false;
    const chain = {
      select: () => chain,
      eq: (c: string, v: unknown) => ((working = working.filter((r) => r[c] === v)), chain),
      is: (c: string, v: unknown) => ((working = working.filter((r) => (r[c] ?? null) === v)), chain),
      in: (c: string, vs: unknown[]) => ((working = working.filter((r) => vs.includes(r[c]))), chain),
      gte: (c: string, v: string) => ((working = working.filter((r) => String(r[c]) >= v)), chain),
      lte: (c: string, v: string) => ((working = working.filter((r) => String(r[c]) <= v)), chain),
      order: (c: string, o?: { ascending?: boolean }) => (
        (working = working.sort((a, b) => (String(a[c]) < String(b[c]) ? -1 : 1) * (o?.ascending === false ? -1 : 1))), chain
      ),
      limit: (n: number) => ((working = working.slice(0, n)), chain),
      maybeSingle: () => {
        single = true;
        return Promise.resolve({ data: working[0] ?? null, error: null });
      },
      then: (resolve: (v: Result) => void) => resolve({ data: single ? working[0] ?? null : working, error: fail(t, "select") }),
    };
    return chain;
  }

  const db = {
    from: (t: string) => {
      touched.push(t);
      return {
        select: () => select(t),
        insert: (row: Row) => {
          const error = fail(t, "insert");
          if (!error) rows(t).push({ id: `${t}-${rows(t).length + 1}`, ...row });
          return Promise.resolve({ data: null, error });
        },
        upsert: (row: Row, opts?: { onConflict?: string; ignoreDuplicates?: boolean }) => {
          const error = fail(t, "upsert");
          if (error) return Promise.resolve({ data: null, error });
          const keys = opts?.onConflict ? [opts.onConflict.split(",").map((s) => s.trim())] : UNIQUE_KEYS[t] ?? [];
          for (const k of keys) {
            const i = conflicts(t, row, k);
            if (i >= 0) {
              if (!opts?.ignoreDuplicates) rows(t)[i] = { ...rows(t)[i], ...row };
              return Promise.resolve({ data: null, error: null });
            }
          }
          rows(t).push({ id: `${t}-${rows(t).length + 1}`, ...row });
          return Promise.resolve({ data: null, error: null });
        },
        delete: () => ({
          eq: (c: string, v: unknown) => {
            tables[t] = rows(t).filter((r) => r[c] !== v);
            return Promise.resolve({ data: null, error: null });
          },
        }),
      };
    },
  } as unknown as SupabaseClient;

  return { db, tables, touched, failing };
}
