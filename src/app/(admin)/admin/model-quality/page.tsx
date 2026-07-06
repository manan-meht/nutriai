import { getModelQualityMetrics } from "../actions";
import { ModelQualityView } from "@/components/admin/ModelQualityView";

export const runtime = "edge";

export default async function ModelQualityPage() {
  const metrics = await getModelQualityMetrics();

  if ("error" in metrics) {
    return <p className="text-sm text-[var(--color-status-support-text)]">{metrics.error}</p>;
  }

  if (metrics.totalReviewed === 0) {
    return (
      <div className="text-center py-16 text-gray-400 text-sm bg-white rounded-2xl border border-gray-100">
        Review meals to start tracking AI quality.
      </div>
    );
  }

  return <ModelQualityView metrics={metrics} />;
}
