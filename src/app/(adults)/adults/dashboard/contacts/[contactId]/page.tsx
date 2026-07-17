export const runtime = "edge";

import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContactDetails, getFoodPreferences } from "../../actions";
import { ContactDashboard } from "@/components/adults/dashboard/ContactDashboard";
import { FoodPreferencesEditor } from "@/components/adults/FoodPreferencesEditor";

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
      <div className="max-w-3xl mx-auto px-4 pb-8">
        <FoodPreferencesEditor contactId={contactId} initialProfile={dietaryProfile} />
      </div>
    </>
  );
}
