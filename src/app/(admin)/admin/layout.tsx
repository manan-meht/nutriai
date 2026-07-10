import { redirect } from "next/navigation";
import Link from "next/link";
import { getAdminSession } from "@/lib/admin/auth";

export const runtime = "edge";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();
  if (!session) redirect("/");

  return (
    <div className="min-h-screen bg-[var(--color-dashboard-surface)]">
      <header className="bg-[var(--color-dashboard-primary)] px-4 sm:px-6 py-3">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center gap-x-6 gap-y-2">
          <span className="text-white font-bold text-sm">Tistra Meal Review Console</span>
          <nav className="flex gap-4 text-sm text-white/80 overflow-x-auto">
            <Link href="/admin" className="hover:text-white whitespace-nowrap">Review queue</Link>
            <Link href="/admin?tab=food-knowledge" className="hover:text-white whitespace-nowrap">Food knowledge</Link>
            <Link href="/admin?tab=model-quality" className="hover:text-white whitespace-nowrap">Model quality</Link>
          </nav>
          <span className="sm:ml-auto text-xs text-white/60 capitalize">{session.role.replace("_", " ")}</span>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">{children}</main>
    </div>
  );
}
