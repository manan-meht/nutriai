export const runtime = "edge";

import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContactDetails, getFoodPreferences, generateAccessCodeAction, regenerateAccessCodeAction, revokeAccessCodeAction } from "../../actions";
import { ContactDashboard } from "@/components/adults/dashboard/ContactDashboard";
import { FoodPreferencesEditor } from "@/components/adults/FoodPreferencesEditor";
import { AccessCodeCard } from "@/components/shared/dashboard/AccessCodeCard";

export default async function ContactPage({ params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/adults/login");

  const details = await getContactDetails(contactId);
  if (!details) notFound();
  const dietaryProfile = await getFoodPreferences(contactId);

  return (
    <>
      <ContactDashboard {...details} />
      <div className="max-w-3xl mx-auto px-4 pb-8 space-y-6">
        <AccessCodeCard
          personName={details.contact.fullName}
          buildWhatsAppMessage={(formattedCode) =>
            `Hi ${details.contact.fullName}! Here's your Tistra Health access code: ${formattedCode}. Go to tistrahealth.com/my-progress, enter your WhatsApp number and this code to view your dashboard. It works once and expires soon.`
          }
          onGenerate={(ttlHours) => generateAccessCodeAction(contactId, ttlHours)}
          onRegenerate={(ttlHours) => regenerateAccessCodeAction(contactId, ttlHours)}
          onRevoke={() => revokeAccessCodeAction(contactId)}
        />
        <FoodPreferencesEditor contactId={contactId} initialProfile={dietaryProfile} />
      </div>
    </>
  );
}
