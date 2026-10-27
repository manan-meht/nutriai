
import { redirect, notFound } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getClientDetails, generateClientAccessCodeAction, regenerateClientAccessCodeAction, revokeClientAccessCodeAction } from "../../actions";
import { ClientDashboard } from "@/components/gym/dashboard/ClientDashboard";
import { AccessCodeCard } from "@/components/shared/dashboard/AccessCodeCard";
import { GuidanceEntryCard } from "@/components/guidance/GuidanceEntryCard";
import { loadGuidanceEntry } from "@/lib/guidance/view";

export default async function ClientPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?product=coach");

  const details = await getClientDetails(clientId);
  if (!details) notFound();
  // getClientDetails returning a client is the ownership check (trainer_id),
  // so the entry, which carries only the mode, is safe to load for it.
  const guidanceEntry = await loadGuidanceEntry(createServiceClient(), clientId, "gym");

  return (
    <>
      <ClientDashboard {...details} />
      <div className="max-w-3xl mx-auto px-4 pt-6 pb-8 space-y-6">
        {guidanceEntry.visible && (
          <GuidanceEntryCard
            href={`/gym/dashboard/clients/${clientId}/guidance`}
            mode={guidanceEntry.mode}
            personName={details.client.fullName}
          />
        )}
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
