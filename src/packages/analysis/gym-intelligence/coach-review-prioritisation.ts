import type { CoachReviewItem, CoachReviewReason } from "@/types";

interface ClientActivity {
  clientId: string;
  clientName: string;
  mealsLoggedLast3Days: number;
  proteinTargetMissedDays: number;
  hasUnreadMessage: boolean;
  hasReportReady: boolean;
  goalDeclineTrend: boolean;
  lastActivityAt: Date;
}

export function buildReviewQueue(clients: ClientActivity[]): CoachReviewItem[] {
  const items: CoachReviewItem[] = [];

  for (const client of clients) {
    const reasons: Array<{ reason: CoachReviewReason; severity: "low" | "medium" | "high" }> = [];

    if (client.mealsLoggedLast3Days === 0) {
      reasons.push({ reason: "low_logging", severity: "high" });
    } else if (client.mealsLoggedLast3Days < 3) {
      reasons.push({ reason: "low_logging", severity: "medium" });
    }

    if (client.proteinTargetMissedDays >= 3) {
      reasons.push({ reason: "protein_target_missed", severity: "medium" });
    }

    if (client.hasUnreadMessage) {
      reasons.push({ reason: "trainer_message_pending", severity: "high" });
    }

    if (client.hasReportReady) {
      reasons.push({ reason: "report_ready", severity: "low" });
    }

    if (client.goalDeclineTrend) {
      reasons.push({ reason: "goal_declining", severity: "medium" });
    }

    // One review item per client, highest severity wins
    if (reasons.length > 0) {
      const topReason = reasons.sort((a, b) => {
        const order = { high: 0, medium: 1, low: 2 };
        return order[a.severity] - order[b.severity];
      })[0];

      items.push({
        clientId: client.clientId,
        clientName: client.clientName,
        reason: topReason.reason,
        severity: topReason.severity,
        lastActivityAt: client.lastActivityAt,
      });
    }
  }

  // Sort: high → medium → low, then by lastActivityAt ascending (longest inactive first)
  return items.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    const severityDiff = order[a.severity] - order[b.severity];
    if (severityDiff !== 0) return severityDiff;
    return a.lastActivityAt.getTime() - b.lastActivityAt.getTime();
  });
}
