import type { PhotoSubmittersResult } from "@/app/(admin)/admin/actions";

// All-time photo submitters. Server-rendered, like the rest of the console.
//
// The list is short (tens of people, not thousands) and answers one
// question, so it is deliberately one sorted table with no filters or
// paging — anything more would be scaffolding around four numbers.

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** "3 days ago" reads faster than a date when the question is whether
 * someone is still active. */
function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function recencyLabel(iso: string): string {
  const days = daysSince(iso);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{value}</p>
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

export function PhotoSubmittersView({ data }: { data: PhotoSubmittersResult }) {
  const { rows, totalPhotos, totalSubmitters, medianPhotos, showsNames } = data;

  if (totalSubmitters === 0) {
    return (
      <div className="space-y-5">
        <h1 className="text-lg font-bold text-gray-900">Photo submitters</h1>
        <div className="text-center py-16 text-gray-400 text-sm bg-white rounded-2xl border border-gray-100">
          Nobody has sent a meal photo yet.
        </div>
      </div>
    );
  }

  // The busiest submitter sets the bar width, so the column reads as a
  // distribution rather than 28 near-identical bars.
  const busiest = rows[0].photoCount;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-gray-900">Photo submitters</h1>
        <p className="text-sm text-gray-500 mt-1">
          Everyone who has ever sent Tistra a meal photo, most first.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Stat label="Photos" value={totalPhotos.toLocaleString("en-IN")} hint="all time" />
        <Stat label="Submitters" value={totalSubmitters} hint="people who sent at least one" />
        <Stat label="Median" value={medianPhotos} hint="photos per submitter" />
      </div>

      {!showsNames && (
        <p className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2">
          Names are hidden for your role. Each person keeps the same
          &ldquo;User #&rdquo; number across the console.
        </p>
      )}

      {/* Cards on mobile, table from md up — same split as the review queue. */}
      <div className="md:hidden space-y-3">
        {rows.map((row, i) => (
          <div key={row.personId} className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-medium text-gray-900 text-sm">
                <span className="text-gray-300 tabular-nums mr-2">{i + 1}</span>
                {row.displayName}
                {row.isRemoved && <span className="ml-2 text-xs text-gray-400">removed</span>}
              </span>
              <span className="text-lg font-bold text-gray-900 tabular-nums">{row.photoCount}</span>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {row.activeDays} active {row.activeDays === 1 ? "day" : "days"} · {row.mealCount} meals logged
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {formatDate(row.firstPhotoAt)} → {formatDate(row.lastPhotoAt)} ({recencyLabel(row.lastPhotoAt)})
            </p>
          </div>
        ))}
      </div>

      <div className="hidden md:block bg-white rounded-2xl border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
              <th className="p-3 w-8" />
              <th className="p-3">Person</th>
              <th className="p-3">Photos</th>
              <th className="p-3">Active days</th>
              <th className="p-3">All meals</th>
              <th className="p-3">First photo</th>
              <th className="p-3">Last photo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.personId} className="border-b border-gray-50 last:border-0">
                <td className="p-3 text-gray-300 tabular-nums text-xs">{i + 1}</td>
                <td className="p-3 text-gray-900 font-medium">
                  {row.displayName}
                  {row.product === "gym" && <span className="ml-2 text-xs text-gray-400">coach client</span>}
                  {row.isRemoved && <span className="ml-2 text-xs text-gray-400">removed</span>}
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums font-semibold text-gray-900 w-10">{row.photoCount}</span>
                    <span
                      className="h-1.5 rounded-full bg-[var(--color-dashboard-primary)] min-w-[2px]"
                      style={{ width: `${Math.round((row.photoCount / busiest) * 100)}px` }}
                      aria-hidden="true"
                    />
                  </div>
                </td>
                <td className="p-3 text-gray-600 tabular-nums">{row.activeDays}</td>
                <td className="p-3 text-gray-600 tabular-nums">{row.mealCount}</td>
                <td className="p-3 text-gray-600 whitespace-nowrap">{formatDate(row.firstPhotoAt)}</td>
                <td className="p-3 text-gray-600 whitespace-nowrap">
                  {formatDate(row.lastPhotoAt)}
                  <span className="text-gray-400 text-xs ml-1">({recencyLabel(row.lastPhotoAt)})</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
