import type { NotificationPayload } from "@/types";

type GymTemplateKey =
  | "gym.client_inactive"
  | "gym.protein_target_missed"
  | "gym.report_ready"
  | "gym.weekly_report_sent"
  | "gym.goal_declining"
  | "gym.message_pending"
  | "gym.training_nutrition_incomplete"
  | "gym.invitation_accepted";

interface GymNotificationContext {
  clientName?: string;
  trainerName?: string;
  daysMissed?: number;
  targetMissedDays?: number;
  weekStarting?: string;
}

export function buildGymNotification(
  workspaceId: string,
  recipientId: string,
  templateKey: GymTemplateKey,
  context: GymNotificationContext
): NotificationPayload {
  const templates: Record<GymTemplateKey, { title: string; body: string }> = {
    "gym.client_inactive": {
      title: "Client activity update",
      body: `${context.clientName ?? "A client"} hasn't logged meals in ${context.daysMissed ?? 3} days. You may want to follow up.`,
    },
    "gym.protein_target_missed": {
      title: "Protein target review",
      body: `${context.clientName ?? "A client"}'s weekly review is ready. Protein adherence appears below target on ${context.targetMissedDays ?? "several"} training days.`,
    },
    "gym.report_ready": {
      title: "Weekly report ready",
      body: `${context.clientName ?? "A client"}'s weekly review is ready for your approval.`,
    },
    "gym.weekly_report_sent": {
      title: "Weekly report sent",
      body: `Your weekly review from ${context.trainerName ?? "your trainer"} for the week of ${context.weekStarting ?? "this week"} is ready.`,
    },
    "gym.goal_declining": {
      title: "Goal trend to review",
      body: `${context.clientName ?? "A client"}'s goal adherence has declined over the past two weeks. A coaching review may help.`,
    },
    "gym.message_pending": {
      title: "New message from client",
      body: `${context.clientName ?? "A client"} has sent you a message that needs a response.`,
    },
    "gym.training_nutrition_incomplete": {
      title: "Training nutrition gap",
      body: `${context.clientName ?? "A client"} has repeatedly missed post-workout nutrition this week.`,
    },
    "gym.invitation_accepted": {
      title: "Client joined",
      body: `${context.clientName ?? "A new client"} has accepted your invitation and joined the workspace.`,
    },
  };

  const template = templates[templateKey];
  return {
    workspaceId,
    workspaceType: "gym",
    recipientId,
    channel: "in_app",
    templateKey,
    title: template.title,
    body: template.body,
    metadata: context as Record<string, unknown>,
  };
}
