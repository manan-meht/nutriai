import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getClientDetails } from "../../actions";
import { ClientDashboard } from "@/components/gym/dashboard/ClientDashboard";

export default async function ClientPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/gym/login");

  const details = await getClientDetails(clientId);
  if (!details) notFound();

  return <ClientDashboard {...details} />;
}
