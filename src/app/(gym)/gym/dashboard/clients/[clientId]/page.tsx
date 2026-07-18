export const runtime = "edge";

import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getClientDetails, generateClientAccessCodeAction, regenerateClientAccessCodeAction, revokeClientAccessCodeAction } from "../../actions";
import { ClientDashboard } from "@/components/gym/dashboard/ClientDashboard";
import { AccessCodeCard } from "@/components/shared/dashboard/AccessCodeCard";

export default async function ClientPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/gym/login");

  const details = await getClientDetails(clientId);
  if (!details) notFound();

  return (
    <>
      <ClientDashboard {...details} />
      <div className="max-w-3xl mx-auto px-4 pb-8">
        <AccessCodeCard
          personName={details.client.fullName}
          onGenerate={generateClientAccessCodeAction.bind(null, clientId)}
          onRegenerate={regenerateClientAccessCodeAction.bind(null, clientId)}
          onRevoke={revokeClientAccessCodeAction.bind(null, clientId)}
        />
      </div>
    </>
  );
}
