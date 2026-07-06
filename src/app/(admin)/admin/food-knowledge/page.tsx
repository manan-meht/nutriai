import { listFoodKnowledge } from "../actions";
import { getAdminSession, canWriteFoodKnowledgeBase } from "@/lib/admin/auth";
import { FoodKnowledgeTable } from "@/components/admin/FoodKnowledgeTable";

export const runtime = "edge";

export default async function FoodKnowledgePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const session = await getAdminSession();
  const result = await listFoodKnowledge(q);

  if ("error" in result) {
    return <p className="text-sm text-[var(--color-status-support-text)]">{result.error}</p>;
  }

  return (
    <FoodKnowledgeTable
      entries={result.entries}
      canWrite={session ? canWriteFoodKnowledgeBase(session.role) : false}
      initialSearch={q ?? ""}
    />
  );
}
