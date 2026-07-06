import { notFound } from "next/navigation";
import { getMealReviewDetail } from "../../actions";
import { ReviewForm } from "@/components/admin/ReviewForm";

export const runtime = "edge";

export default async function MealReviewDetailPage({ params }: { params: Promise<{ mealSubmissionId: string }> }) {
  const { mealSubmissionId } = await params;
  const detail = await getMealReviewDetail(mealSubmissionId);

  if ("error" in detail) notFound();

  return <ReviewForm detail={detail} />;
}
