import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContactDetails } from "../../actions";
import { ContactDashboard } from "@/components/adults/dashboard/ContactDashboard";

export default async function ContactPage({ params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/adults/login");

  const details = await getContactDetails(contactId);
  if (!details) notFound();

  return <ContactDashboard {...details} />;
}
