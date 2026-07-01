import { createClient } from "@/lib/supabase/server";
import { getMealsForWorkspaceSince } from "@/packages/core/meals";
import { buildReviewQueue } from "@/packages/analysis/gym-intelligence/coach-review-prioritisation";
import type {
  CoachDashboard,
  CoachClientDetail,
  CoachReviewItem,
  GymGoalConfig,
} from "@/types";

export interface GymDashboardService {
  getCoachOverview(workspaceId: string, viewerId: string): Promise<CoachDashboard>;
  getClientDetail(workspaceId: string, clientId: string, viewerId: string): Promise<CoachClientDetail>;
  getReviewQueue(workspaceId: string, viewerId: string): Promise<CoachReviewItem[]>;
}

class CoachDashboardServiceImpl implements GymDashboardService {
  async getCoachOverview(workspaceId: string, viewerId: string): Promise<CoachDashboard> {
    const supabase = await createClient();

    // Verify viewer is a trainer in this workspace
    const { data: memberRow } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", viewerId)
      .single();

    if (!memberRow || !["trainer", "gym_owner"].includes(memberRow.role)) {
      throw new Error("Unauthorised: viewer is not a trainer in this workspace");
    }

    // Fetch all active clients
    const { data: assignments } = await supabase
      .from("trainer_client_assignments")
      .select("client_id, profiles:client_id(full_name)")
      .eq("workspace_id", workspaceId)
      .eq("trainer_id", viewerId)
      .eq("is_active", true);

    const clients = assignments ?? [];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let mealsLoggedToday = 0;
    let reportsAwaitingApproval = 0;

    const clientRows: CoachDashboard["clients"] = [];
    const attentionInputs: Parameters<typeof buildReviewQueue>[0] = [];

    for (const assignment of clients) {
      const profile = (assignment as any).profiles;
      const clientId = assignment.client_id;
      const clientName = profile?.full_name ?? "Unknown";

      const recentMeals = await getMealsForWorkspaceSince(workspaceId, weekAgo);
      const clientMeals = recentMeals.filter((m) => m.mealLoggerId === clientId);
      const todayMeals = clientMeals.filter((m) => new Date(m.loggedAt) >= today);
      mealsLoggedToday += todayMeals.length;

      const expectedMealsThisWeek = 21;
      const loggingConsistency = Math.min(clientMeals.length / expectedMealsThisWeek, 1);

      // Fetch goals
      const { data: goalRows } = await supabase
        .from("gym_goal_configs")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("client_id", clientId)
        .eq("status", "active");

      const goals: GymGoalConfig[] = (goalRows ?? []).map(mapGoalRow);

      // Simple adherence estimate
      const proteinGoal = goals.find((g) => g.metric === "protein_grams");
      const avgProtein =
        clientMeals.reduce((s, m) => s + (m.nutritionEstimate.proteinGrams?.max ?? 0), 0) /
        Math.max(clientMeals.length, 1);
      const proteinAdherence = proteinGoal?.targetValue
        ? Math.min(avgProtein / proteinGoal.targetValue, 1)
        : undefined;

      const status: CoachDashboard["clients"][0]["status"] =
        loggingConsistency < 0.3
          ? "inactive"
          : loggingConsistency < 0.5
          ? "needs_review"
          : proteinAdherence !== undefined && proteinAdherence < 0.75
          ? "needs_review"
          : "on_track";

      clientRows.push({
        clientId,
        clientName,
        programmeGoal: "Fitness goal",
        mealsLoggedThisWeek: clientMeals.length,
        expectedMealsThisWeek,
        proteinAdherence,
        loggingConsistency,
        overallGoalAdherence: proteinAdherence ?? loggingConsistency,
        lastActivityAt: clientMeals[0]?.loggedAt,
        status,
      });

      const last3DaysMeals = clientMeals.filter(
        (m) => new Date(m.loggedAt) >= new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
      );

      attentionInputs.push({
        clientId,
        clientName,
        mealsLoggedLast3Days: last3DaysMeals.length,
        proteinTargetMissedDays: 0, // TODO: calculate from daily summaries
        hasUnreadMessage: false,
        hasReportReady: false,
        goalDeclineTrend: status === "needs_review",
        lastActivityAt: clientMeals[0]?.loggedAt ?? new Date(0),
      });
    }

    const attentionQueue = buildReviewQueue(attentionInputs);

    // Reports awaiting approval
    const { count: reportCount } = await supabase
      .from("coach_reports")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("trainer_id", viewerId)
      .eq("status", "pending_approval");

    reportsAwaitingApproval = reportCount ?? 0;

    return {
      activeClientCount: clients.length,
      clientsNeedingReview: clientRows.filter((c) => c.status === "needs_review").length,
      reportsAwaitingApproval,
      mealsLoggedToday,
      attentionQueue,
      clients: clientRows,
      recentMeals: [],
      weeklyReports: [],
    };
  }

  async getClientDetail(
    workspaceId: string,
    clientId: string,
    viewerId: string
  ): Promise<CoachClientDetail> {
    const supabase = await createClient();

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentMeals = await getMealsForWorkspaceSince(workspaceId, weekAgo);
    const clientMeals = recentMeals.filter((m) => m.mealLoggerId === clientId);

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", clientId)
      .single();

    const { data: goalRows } = await supabase
      .from("gym_goal_configs")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("client_id", clientId)
      .eq("status", "active");

    const { data: noteRows } = await supabase
      .from("coach_notes")
      .select("id, body, created_at")
      .eq("workspace_id", workspaceId)
      .eq("trainer_id", viewerId)
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(10);

    return {
      clientId,
      clientName: profile?.full_name ?? "Unknown",
      programmeGoal: "Fitness goal",
      activeGoals: (goalRows ?? []).map(mapGoalRow),
      recentMeals: clientMeals.map((m) => ({
        mealId: m.id,
        clientId,
        clientName: profile?.full_name ?? "Unknown",
        loggedAt: m.loggedAt,
        mealType: m.mealType,
        thumbnailUrl: m.imageUrls?.[0],
        proteinGrams: m.nutritionEstimate.proteinGrams?.max,
      })),
      weeklyInsights: [],
      coachNotes: (noteRows ?? []).map((n: any) => ({
        id: n.id,
        body: n.body,
        createdAt: new Date(n.created_at),
      })),
      loggingConsistency: Math.min(clientMeals.length / 21, 1),
      weeklyAdherence: {},
    };
  }

  async getReviewQueue(workspaceId: string, viewerId: string): Promise<CoachReviewItem[]> {
    const overview = await this.getCoachOverview(workspaceId, viewerId);
    return overview.attentionQueue;
  }
}

export const coachDashboardService: GymDashboardService = new CoachDashboardServiceImpl();

function mapGoalRow(row: any): GymGoalConfig {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    clientId: row.client_id,
    createdByTrainerId: row.created_by_trainer_id,
    metric: row.metric,
    targetValue: row.target_value,
    minimumValue: row.minimum_value,
    maximumValue: row.maximum_value,
    appliesOn: row.applies_on,
    createdByTrainer: !!row.created_by_trainer_id,
    trainerApprovalRequired: row.trainer_approval_required,
    status: row.status,
    startsAt: row.starts_at ? new Date(row.starts_at) : undefined,
    endsAt: row.ends_at ? new Date(row.ends_at) : undefined,
    createdAt: new Date(row.created_at),
  };
}
