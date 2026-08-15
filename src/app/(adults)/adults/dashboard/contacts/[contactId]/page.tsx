
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
      {/* Full-width dark background — a max-w-3xl div alone only colors its
          own constrained column, leaving the page's default white body
          visible at the edges on anything wider than that (and, since this
          is the last thing on the page, "hanging" visibly below
          ContactDashboard's own full-bleed dark background on any viewport
          where this section ends up shorter). */}
      <div className="bg-[var(--color-dashboard-page-bg)]">
      <div className="max-w-3xl mx-auto px-4 pt-6 pb-8 space-y-6">
        {/* Once the user has interacted with (saved) a food preference at
            least once, this moves into the Edit Contact modal instead —
            it no longer needs prominent dashboard placement once it's set
            up, and the modal is where the rest of the profile fields live. */}
        {!dietaryProfile.last_updated_at && (
          <FoodPreferencesEditor contactId={contactId} initialProfile={dietaryProfile} />
        )}
        {/* Never shown for a "self" contact — there's no separate person to
            share a view-only link with; the caregiver's own login already
            is that view. */}
        {details.contact.relationshipType !== "self" && (
          <AccessCodeCard
            personName={details.contact.fullName}
            onGenerate={generateAccessCodeAction.bind(null, contactId)}
            onRegenerate={regenerateAccessCodeAction.bind(null, contactId)}
            onRevoke={revokeAccessCodeAction.bind(null, contactId)}
            dm
          />
        )}
      </div>
      </div>
    </>
  );
}
