import Link from "next/link";
import { getReviewQueue, type QueueFilters } from "../actions";
import { StatusBadge, priorityMood, reviewStatusMood } from "@/components/admin/StatusBadge";

export const runtime = "edge";

const MEAL_TYPES = ["breakfast", "lunch", "snack", "dinner", "unknown"];
const SOURCES = ["whatsapp", "dashboard", "app", "unknown"];

interface SearchParams {
  status?: string;
  priority?: string;
  mealType?: string;
  source?: string;
  market?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: string;
}

export default async function MealReviewQueuePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const filters: QueueFilters = {
    status: (sp.status as QueueFilters["status"]) ?? "pending",
    priority: (sp.priority as QueueFilters["priority"]) ?? "all",
    mealType: sp.mealType || undefined,
    source: sp.source || undefined,
    market: sp.market || undefined,
    dateFrom: sp.dateFrom || undefined,
    dateTo: sp.dateTo || undefined,
    sort: (sp.sort as QueueFilters["sort"]) ?? "newest",
  };

  const result = await getReviewQueue(filters);
  if ("error" in result) {
    return <p className="text-sm text-[var(--color-status-support-text)]">{result.error}</p>;
  }

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-bold text-gray-900">Meal Review Queue</h1>

      <form className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-wrap gap-3 items-end" method="get">
        <FilterSelect name="status" label="Status" defaultValue={filters.status ?? "pending"} options={["pending", "reviewed", "escalated", "all"]} />
        <FilterSelect name="priority" label="Priority" defaultValue={filters.priority ?? "all"} options={["all", "high", "medium", "low"]} />
        <FilterSelect name="mealType" label="Meal type" defaultValue={sp.mealType ?? ""} options={["", ...MEAL_TYPES]} />
        <FilterSelect name="source" label="Source" defaultValue={sp.source ?? ""} options={["", ...SOURCES]} />
        <label className="text-xs text-gray-500 flex flex-col gap-1">
          Market
          <input name="market" defaultValue={sp.market ?? ""} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
        </label>
        <label className="text-xs text-gray-500 flex flex-col gap-1">
          From
          <input type="date" name="dateFrom" defaultValue={sp.dateFrom ?? ""} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
        </label>
        <label className="text-xs text-gray-500 flex flex-col gap-1">
          To
          <input type="date" name="dateTo" defaultValue={sp.dateTo ?? ""} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
        </label>
        <FilterSelect
          name="sort"
          label="Sort"
          defaultValue={filters.sort ?? "newest"}
          options={["newest", "oldest", "lowest_confidence", "highest_priority"]}
        />
        <button className="bg-[var(--color-dashboard-primary)] text-white text-sm font-medium rounded-lg px-4 py-1.5">Apply</button>
      </form>

      {result.items.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm bg-white rounded-2xl border border-gray-100">
          No meals need review right now.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                <th className="p-3">Photo</th>
                <th className="p-3">Submitted</th>
                <th className="p-3">Meal type</th>
                <th className="p-3">Source</th>
                <th className="p-3">AI summary</th>
                <th className="p-3">Confidence</th>
                <th className="p-3">Priority</th>
                <th className="p-3">Status</th>
                <th className="p-3">User</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {result.items.map((item) => (
                <tr key={item.id} className="border-b border-gray-50 last:border-0">
                  <td className="p-3">
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL
                      <img src={item.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-gray-100" />
                    )}
                  </td>
                  <td className="p-3 text-gray-600 whitespace-nowrap">
                    {new Date(item.submittedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="p-3 capitalize text-gray-700">{item.mealType}</td>
                  <td className="p-3 capitalize text-gray-700">{item.source}</td>
                  <td className="p-3 text-gray-600 max-w-[200px] truncate">{item.aiSummary}</td>
                  <td className="p-3 text-gray-600">{item.confidenceScore != null ? `${Math.round(item.confidenceScore * 100)}%` : "—"}</td>
                  <td className="p-3">
                    <StatusBadge label={item.priority} mood={priorityMood(item.priority)} />
                  </td>
                  <td className="p-3">
                    <StatusBadge label={item.reviewStatus} mood={reviewStatusMood(item.reviewStatus)} />
                  </td>
                  <td className="p-3 text-gray-500 whitespace-nowrap">{item.anonymizedUserId}</td>
                  <td className="p-3">
                    <Link href={`/admin/meal-review/${item.id}`} className="text-[var(--color-dashboard-primary)] text-sm font-medium">
                      Review
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilterSelect({ name, label, defaultValue, options }: { name: string; label: string; defaultValue: string; options: string[] }) {
  return (
    <label className="text-xs text-gray-500 flex flex-col gap-1">
      {label}
      <select name={name} defaultValue={defaultValue} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm capitalize">
        {options.map((o) => (
          <option key={o} value={o}>
            {o === "" ? "Any" : o.replace("_", " ")}
          </option>
        ))}
      </select>
    </label>
  );
}
