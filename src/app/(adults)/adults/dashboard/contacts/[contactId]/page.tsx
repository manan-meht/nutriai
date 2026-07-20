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
          onGenerate={generateAccessCodeAction.bind(null, contactId)}
          onRegenerate={regenerateAccessCodeAction.bind(null, contactId)}
          onRevoke={revokeAccessCodeAction.bind(null, contactId)}
        />
        {/* Once the user has interacted with (saved) a food preference at
            least once, this moves into the Edit Contact modal instead —
            it no longer needs prominent dashboard placement once it's set
            up, and the modal is where the rest of the profile fields live. */}
        {!dietaryProfile.last_updated_at && (
          <FoodPreferencesEditor contactId={contactId} initialProfile={dietaryProfile} />
        )}
      </div>
    </>
  );
}
