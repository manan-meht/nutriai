import type { NotificationPayload } from "@/types";

type FamilyTemplateKey =
  | "family.meal_missed_pattern"
  | "family.weekly_summary_ready"
  | "family.low_appetite_pattern"
  | "family.no_recent_activity"
  | "family.goal_proposed"
  | "family.goal_accepted"
  | "family.goal_declined"
  | "family.invitation_accepted"
  | "family.permission_updated";

interface FamilyNotificationContext {
  personName?: string;
  supporterName?: string;
  weekStarting?: string;
  goalDescription?: string;
  daysMissed?: number;
  relationshipLabel?: string;
}

export function buildFamilyNotification(
  workspaceId: string,
  recipientId: string,
  templateKey: FamilyTemplateKey,
  context: FamilyNotificationContext
): NotificationPayload {
  const person = context.personName ?? "Your family member";
  const possessive = context.personName
    ? `${context.personName}'s`
    : "Their";

  const templates: Record<FamilyTemplateKey, { title: string; body: string }> = {
    "family.meal_missed_pattern": {
      title: "Gentle check-in",
      body: `${person} shared fewer breakfasts than usual this week. You may want to check whether their morning routine has changed.`,
    },
    "family.weekly_summary_ready": {
      title: "Weekly summary ready",
      body: `${possessive} weekly summary for the week of ${context.weekStarting ?? "this week"} is ready to view.`,
    },
    "family.low_appetite_pattern": {
      title: "Something worth noting",
      body: `${person} has mentioned a lower appetite on a few occasions recently. A gentle check-in could be reassuring.`,
    },
    "family.no_recent_activity": {
      title: "A quiet week",
      body: `${person} hasn't shared any meals in the past ${context.daysMissed ?? 4} days. It may just be that logging has paused — a message to say hello could be nice.`,
    },
    "family.goal_proposed": {
      title: "New goal suggested",
      body: `${context.supporterName ?? "A family member"} has suggested a gentle goal: ${context.goalDescription ?? "a new goal"}. You can accept, change, or decline it whenever you like.`,
    },
    "family.goal_accepted": {
      title: "Goal accepted",
      body: `${person} has accepted the goal: ${context.goalDescription ?? "the suggested goal"}.`,
    },
    "family.goal_declined": {
      title: "Goal declined",
      body: `${person} has chosen not to take on the goal right now. That's completely fine — you can suggest a different one whenever feels right.`,
    },
    "family.invitation_accepted": {
      title: "Family member joined",
      body: `${person} has accepted your invitation and chosen their sharing preferences.`,
    },
    "family.permission_updated": {
      title: "Sharing preferences updated",
      body: `${person} has updated what they'd like to share with you.`,
    },
  };

  const template = templates[templateKey];
  return {
    workspaceId,
    workspaceType: "family",
    recipientId,
    channel: "in_app",
    templateKey,
    title: template.title,
    body: template.body,
    metadata: context as Record<string, unknown>,
  };
}
