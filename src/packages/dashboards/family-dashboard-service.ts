import { createClient } from "@/lib/supabase/server";
import { getMealsForUser } from "@/packages/core/meals";
import { analyseFamilyMeal } from "@/packages/analysis/family-intelligence/family-meal-analysis";
import { generateFamilyWeeklySummary } from "@/packages/analysis/family-intelligence/family-summary-generator";
import { evaluateFamilyAlerts } from "@/packages/analysis/family-intelligence/family-alert-evaluator";
import type {
  FamilyDashboard,
  FamilyWeeklySummary,
  FamilyAlertPreview,
  FamilySharingPermissions,
} from "@/types";

export interface FamilyDashboardService {
  getFamilyOverview(
    workspaceId: string,
    supportedPersonId: string,
    viewerId: string
  ): Promise<FamilyDashboard>;

  getWeeklyFamilySummary(
    workspaceId: string,
    supportedPersonId: string,
    viewerId: string
  ): Promise<FamilyWeeklySummary>;

  getFamilyAlerts(
    workspaceId: string,
    supportedPersonId: string,
    viewerId: string
  ): Promise<FamilyAlertPreview[]>;
}

class FamilyDashboardServiceImpl implements FamilyDashboardService {
  async getFamilyOverview(
    workspaceId: string,
    supportedPersonId: string,
    viewerId: string
  ): Promise<FamilyDashboard> {
    const supabase = await createClient();

    // Load sharing permissions — backend enforces, not frontend
    const permissions = await this.getPermissions(workspaceId, supportedPersonId, viewerId);
    if (!permissions) throw new Error("Viewer does not have access to this person's data");

    // Load supported person's profile
    const { data: personProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", supportedPersonId)
      .single();

    const { data: relationship } = await supabase
      .from("support_relationships")
      .select("relationship_label")
      .eq("workspace_id", workspaceId)
      .eq("older_adult_id", supportedPersonId)
      .eq("supporter_id", viewerId)
      .single();

    // Fetch recent meals
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const allRecentMeals = await getMealsForUser(workspaceId, supportedPersonId, 50);
    const weekMeals = allRecentMeals.filter((m) => new Date(m.loggedAt) >= weekAgo);
    const olderMeals = allRecentMeals.filter((m) => new Date(m.loggedAt) < weekAgo);

    // Generate insights
    const insights = await Promise.all(
      weekMeals.map((meal) => analyseFamilyMeal(meal, olderMeals))
    );

    // Build weekly summary
    const weekStarting = new Date();
    weekStarting.setDate(weekStarting.getDate() - weekStarting.getDay()); // Sunday
    weekStarting.setHours(0, 0, 0, 0);

    const summary = await generateFamilyWeeklySummary(
      workspaceId,
      supportedPersonId,
      weekStarting,
      weekMeals,
      insights
    );

    // Build goals
    const { data: goalRows } = await supabase
      .from("family_goal_configs")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("older_adult_id", supportedPersonId)
      .eq("status", "active")
      .eq("accepted_by_meal_logger", true);

    const activeGoals = (goalRows ?? []).map((g: any) => ({
      goal: mapFamilyGoal(g),
      currentCount: 0, // TODO: calculate from this week's insights
      weeklyTarget: g.weekly_target ?? 3,
      progressFraction: 0,
    }));

    // Build meal previews — apply permissions
    const recentMeals = weekMeals.slice(0, 10).map((m) => ({
      mealId: m.id,
      loggedAt: m.loggedAt,
      mealType: m.mealType,
      description: permissions.canSeeMealDescriptions ? m.notes : undefined,
      thumbnailUrl: permissions.canSeeMealPhotos ? m.imageUrls?.[0] : undefined,
      hadProteinSource: insights.find((i) => i.mealId === m.id)?.proteinSourceDetected,
      hadFruit: insights.find((i) => i.mealId === m.id)?.fruitDetected,
      hadVegetable: insights.find((i) => i.mealId === m.id)?.vegetableDetected,
    }));

    // Alerts
    const alertCandidates = evaluateFamilyAlerts(weekMeals, insights);
    const alerts: FamilyAlertPreview[] = alertCandidates.map((a, idx) => ({
      alertId: `alert-${idx}`,
      alertType: a.alertType,
      observedPattern: a.observedPattern,
      timePeriodDays: a.timePeriodDays,
      confidence: a.confidence,
      suggestedAction: a.suggestedAction,
      createdAt: new Date(),
    }));

    const lastMealAt = weekMeals[0]?.loggedAt;

    return {
      supportedPerson: {
        id: supportedPersonId,
        name: personProfile?.full_name ?? "Family member",
        relationshipLabel: relationship?.relationship_label ?? "Family member",
        lastMealAt,
        lastCheckinAt: undefined,
      },
      weeklyStatus: summary.weeklyStatus,
      weeklySummary: summary.summaryText,
      mealsSharedThisWeek: weekMeals.length,
      expectedMealCoverage: 14,
      indicators: summary.indicators as any,
      activeGoals,
      recentMeals,
      alerts: permissions.canSeeAlerts ? alerts : [],
      suggestedSupportiveAction: summary.suggestedAction,
    };
  }

  async getWeeklyFamilySummary(
    workspaceId: string,
    supportedPersonId: string,
    viewerId: string
  ): Promise<FamilyWeeklySummary> {
    const permissions = await this.getPermissions(workspaceId, supportedPersonId, viewerId);
    if (!permissions?.canSeeWeeklySummaries) throw new Error("Access denied");

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const allMeals = await getMealsForUser(workspaceId, supportedPersonId, 50);
    const weekMeals = allMeals.filter((m) => new Date(m.loggedAt) >= weekAgo);
    const olderMeals = allMeals.filter((m) => new Date(m.loggedAt) < weekAgo);

    const insights = await Promise.all(
      weekMeals.map((meal) => analyseFamilyMeal(meal, olderMeals))
    );

    const weekStarting = new Date();
    weekStarting.setDate(weekStarting.getDate() - weekStarting.getDay());
    weekStarting.setHours(0, 0, 0, 0);

    return generateFamilyWeeklySummary(
      workspaceId,
      supportedPersonId,
      weekStarting,
      weekMeals,
      insights
    );
  }

  async getFamilyAlerts(
    workspaceId: string,
    supportedPersonId: string,
    viewerId: string
  ): Promise<FamilyAlertPreview[]> {
    const permissions = await this.getPermissions(workspaceId, supportedPersonId, viewerId);
    if (!permissions?.canSeeAlerts) return [];

    const weekAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const meals = await getMealsForUser(workspaceId, supportedPersonId, 50);
    const recentMeals = meals.filter((m) => new Date(m.loggedAt) >= weekAgo);
    const olderMeals = meals.filter((m) => new Date(m.loggedAt) < weekAgo);

    const insights = await Promise.all(
      recentMeals.map((meal) => analyseFamilyMeal(meal, olderMeals))
    );

    return evaluateFamilyAlerts(recentMeals, insights, 14).map((a, idx) => ({
      alertId: `alert-${idx}`,
      alertType: a.alertType,
      observedPattern: a.observedPattern,
      timePeriodDays: a.timePeriodDays,
      confidence: a.confidence,
      suggestedAction: a.suggestedAction,
      createdAt: new Date(),
    }));
  }

  private async getPermissions(
    workspaceId: string,
    supportedPersonId: string,
    viewerId: string
  ): Promise<FamilySharingPermissions | null> {
    if (viewerId === supportedPersonId) {
      // The older adult sees everything about themselves
      return {
        canSeeMealPhotos: true,
        canSeeMealDescriptions: true,
        canSeeWeeklySummaries: true,
        canSeeGoalProgress: true,
        canSeeAlerts: true,
        canSeeMessages: true,
        canProposeGoals: false,
      };
    }

    const supabase = await createClient();
    const { data } = await supabase
      .from("sharing_permissions")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("older_adult_id", supportedPersonId)
      .eq("supporter_id", viewerId)
      .single();

    if (!data) return null;

    return {
      canSeeMealPhotos: data.can_see_meal_photos,
      canSeeMealDescriptions: data.can_see_meal_descriptions,
      canSeeWeeklySummaries: data.can_see_weekly_summaries,
      canSeeGoalProgress: data.can_see_goal_progress,
      canSeeAlerts: data.can_see_alerts,
      canSeeMessages: data.can_see_messages,
      canProposeGoals: data.can_propose_goals,
    };
  }
}

export const familyDashboardService: FamilyDashboardService = new FamilyDashboardServiceImpl();

function mapFamilyGoal(row: any) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    olderAdultId: row.older_adult_id,
    proposedById: row.proposed_by_id,
    proposedBy: row.proposed_by_role,
    metric: row.metric,
    weeklyTarget: row.weekly_target,
    consentRequired: row.consent_required,
    acceptedByMealLogger: row.accepted_by_meal_logger,
    acceptedAt: row.accepted_at ? new Date(row.accepted_at) : undefined,
    status: row.status,
    description: row.description,
    startsAt: row.starts_at ? new Date(row.starts_at) : undefined,
    endsAt: row.ends_at ? new Date(row.ends_at) : undefined,
    createdAt: new Date(row.created_at),
  };
}
