"use server";

import { createClient } from "@/lib/supabase/server";

export interface AdultsContact {
  id: string;
  workspaceId: string;
  fullName: string;
  whatsappNumber: string;
  relationship?: string;
  age?: number;
  gender?: "male" | "female" | "other";
  weightKg?: number;
  heightCm?: number;
  healthNotes?: string;
  inviteSentAt?: string;
  inviteAcceptedAt?: string;
  createdAt: string;
  trackedBiomarkers: string[];
  goals: AdultsGoal[];
  mealCount: number;
  lastMealAt?: string;
}

export interface AdultsGoal {
  id: string;
  goalType: string;
  title: string;
  description?: string;
  targetCaloriesMin?: number;
  targetCaloriesMax?: number;
  targetProteinG?: number;
  targetMealsPerDay?: number;
  status: string;
}

export interface AdultsMealLog {
  id: string;
  contactId: string;
  mealType: string;
  loggedAt: string;
  foods: any[];
  totalCaloriesMin: number;
  totalCaloriesMax: number;
  totalProteinMin: number;
  totalProteinMax: number;
  totalCarbsMin: number;
  totalCarbsMax: number;
  totalFatMin: number;
  totalFatMax: number;
  aiSummary?: string;
}

export interface AdultsContactDetails {
  contact: AdultsContact;
  meals: AdultsMealLog[];
}

export async function getOrCreateAdultsWorkspace(userId: string, caregiverName?: string): Promise<{ id: string; name: string }> {
  const { createClient: createServiceClient } = await import("@supabase/supabase-js");
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: existing } = await admin
    .from("workspaces")
    .select("id, name")
    .eq("owner_id", userId)
    .eq("type", "adults")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (existing) return existing;

  const name = `${caregiverName ?? "My"}'s Family`;
  const slug = `adults-${userId.slice(0, 8)}-${Date.now()}`;

  const { data: created, error } = await admin
    .from("workspaces")
    .insert({ type: "adults", name, slug, owner_id: userId })
    .select("id, name")
    .single();

  if (error || !created) throw new Error(`Failed to create workspace: ${error?.message}`);
  return created;
}

export async function getContacts(workspaceId: string): Promise<AdultsContact[]> {
  const supabase = await createClient();

  const { data: contacts } = await supabase
    .from("adults_contacts")
    .select("*, goals:adults_contact_goals(*)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (!contacts?.length) return [];

  const { data: meals } = await supabase
    .from("meal_logs")
    .select("adults_contact_id, logged_at")
    .in("adults_contact_id", contacts.map((c: any) => c.id))
    .order("logged_at", { ascending: false });

  const mealsByContact: Record<string, { count: number; lastAt?: string }> = {};
  for (const m of meals ?? []) {
    if (!m.adults_contact_id) continue;
    if (!mealsByContact[m.adults_contact_id]) {
      mealsByContact[m.adults_contact_id] = { count: 0, lastAt: m.logged_at };
    }
    mealsByContact[m.adults_contact_id].count++;
  }

  return contacts.map((c: any) => ({
    id: c.id,
    workspaceId: c.workspace_id,
    fullName: c.full_name,
    whatsappNumber: c.whatsapp_number,
    relationship: c.relationship,
    age: c.age,
    gender: c.gender,
    weightKg: c.weight_kg,
    heightCm: c.height_cm,
    healthNotes: c.health_notes,
    inviteSentAt: c.invite_sent_at,
    inviteAcceptedAt: c.invite_accepted_at,
    createdAt: c.created_at,
    trackedBiomarkers: c.tracked_biomarkers ?? [],
    mealCount: mealsByContact[c.id]?.count ?? 0,
    lastMealAt: mealsByContact[c.id]?.lastAt,
    goals: (c.goals ?? []).map((g: any) => ({
      id: g.id,
      goalType: g.goal_type,
      title: g.title,
      description: g.description,
      targetCaloriesMin: g.target_calories_min,
      targetCaloriesMax: g.target_calories_max,
      targetProteinG: g.target_protein_g,
      targetMealsPerDay: g.target_meals_per_day,
      status: g.status,
    })),
  }));
}

export async function getContactDetails(contactId: string): Promise<AdultsContactDetails | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [contactRes, mealsRes] = await Promise.all([
    supabase
      .from("adults_contacts")
      .select("*, goals:adults_contact_goals(*)")
      .eq("id", contactId)
      .eq("caregiver_id", user.id)
      .single(),
    supabase
      .from("meal_logs")
      .select("*")
      .eq("adults_contact_id", contactId)
      .gte("logged_at", since.toISOString())
      .order("logged_at", { ascending: false }),
  ]);

  if (!contactRes.data) return null;
  const c = contactRes.data;

  const contact: AdultsContact = {
    id: c.id,
    workspaceId: c.workspace_id,
    fullName: c.full_name,
    whatsappNumber: c.whatsapp_number,
    relationship: c.relationship,
    age: c.age,
    gender: c.gender,
    weightKg: c.weight_kg,
    heightCm: c.height_cm,
    healthNotes: c.health_notes,
    inviteSentAt: c.invite_sent_at,
    inviteAcceptedAt: c.invite_accepted_at,
    createdAt: c.created_at,
    trackedBiomarkers: c.tracked_biomarkers ?? [],
    mealCount: mealsRes.data?.length ?? 0,
    lastMealAt: mealsRes.data?.[0]?.logged_at,
    goals: (c.goals ?? []).map((g: any) => ({
      id: g.id,
      goalType: g.goal_type,
      title: g.title,
      description: g.description,
      targetCaloriesMin: g.target_calories_min,
      targetCaloriesMax: g.target_calories_max,
      targetProteinG: g.target_protein_g,
      targetMealsPerDay: g.target_meals_per_day,
      status: g.status,
    })),
  };

  const meals: AdultsMealLog[] = (mealsRes.data ?? []).map((m: any) => ({
    id: m.id,
    contactId: m.adults_contact_id,
    mealType: m.meal_type,
    loggedAt: m.logged_at,
    foods: m.foods ?? [],
    totalCaloriesMin: m.total_calories_min ?? 0,
    totalCaloriesMax: m.total_calories_max ?? 0,
    totalProteinMin: m.total_protein_min ?? 0,
    totalProteinMax: m.total_protein_max ?? 0,
    totalCarbsMin: m.total_carbs_min ?? 0,
    totalCarbsMax: m.total_carbs_max ?? 0,
    totalFatMin: m.total_fat_min ?? 0,
    totalFatMax: m.total_fat_max ?? 0,
    aiSummary: m.ai_summary,
  }));

  return { contact, meals };
}

export async function addContact(formData: {
  workspaceId: string;
  fullName: string;
  whatsappNumber: string;
  relationship?: string;
  age?: number;
  gender?: string;
  weightKg?: number;
  heightCm?: number;
  healthNotes?: string;
  goalType?: string;
  goalTitle?: string;
  goalDescription?: string;
  targetCaloriesMin?: number;
  targetCaloriesMax?: number;
  targetProteinG?: number;
  targetMealsPerDay?: number;
}): Promise<{ contactId: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: contact, error } = await supabase
    .from("adults_contacts")
    .insert({
      workspace_id: formData.workspaceId,
      caregiver_id: user.id,
      full_name: formData.fullName,
      whatsapp_number: formData.whatsappNumber,
      relationship: formData.relationship || null,
      age: formData.age || null,
      gender: formData.gender || null,
      weight_kg: formData.weightKg || null,
      height_cm: formData.heightCm || null,
      health_notes: formData.healthNotes || null,
      invite_sent_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !contact) throw new Error(error?.message ?? "Failed to add contact");

  if (formData.goalType && formData.goalTitle) {
    await supabase.from("adults_contact_goals").insert({
      contact_id: contact.id,
      caregiver_id: user.id,
      goal_type: formData.goalType,
      title: formData.goalTitle,
      description: formData.goalDescription || null,
      target_calories_min: formData.targetCaloriesMin || null,
      target_calories_max: formData.targetCaloriesMax || null,
      target_protein_g: formData.targetProteinG || null,
      target_meals_per_day: formData.targetMealsPerDay || null,
    });
  }

  // Auto-send WhatsApp invite
  try {
    const { sendTextMessage } = await import("@/lib/whatsapp/client");
    const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
    const caregiverName = profile?.full_name ?? "Your family member";
    const firstName = formData.fullName.split(" ")[0];
    await sendTextMessage(
      formData.whatsappNumber,
      `Hi ${firstName}! 👋\n\n${caregiverName} has set up Tistra Family to help keep an eye on your nutrition.\n\nAll you need to do is send me a photo or describe what you eat — right here on WhatsApp. I'll keep track for you!\n\nWhenever you're ready, just send me a photo of your next meal 😊`
    );
  } catch {
    // Don't fail contact creation if WhatsApp send fails
  }

  return { contactId: contact.id };
}
