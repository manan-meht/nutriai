import type { GymClient } from "@/app/(gym)/gym/dashboard/actions";

const GOAL_LABELS: Record<string, string> = {
  weight_loss: "Weight loss",
  muscle_gain: "Muscle gain",
  fat_loss: "Fat loss",
  maintenance: "Maintenance",
  strength: "Strength",
  endurance: "Endurance",
  custom: "Custom",
};

const GOAL_COLORS: Record<string, string> = {
  weight_loss: "bg-orange-50 text-orange-700",
  muscle_gain: "bg-blue-50 text-blue-700",
  fat_loss: "bg-red-50 text-red-700",
  maintenance: "bg-gray-100 text-gray-600",
  strength: "bg-yellow-50 text-yellow-700",
  endurance: "bg-green-50 text-green-700",
  custom: "bg-purple-50 text-purple-700",
};

interface ClientCardProps {
  client: GymClient;
  onOpen?: () => void;
  onRemove?: () => void;
}

export function ClientCard({ client, onOpen, onRemove }: ClientCardProps) {
  const initials = client.fullName
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const activeGoal = client.goals.find((g) => g.status === "active");
  const isActive = client.mealCount > 0;

  const lastMealLabel = client.lastMealAt
    ? formatRelative(new Date(client.lastMealAt))
    : null;

  return (
    <div
      className="bg-white rounded-2xl border border-gray-100 p-5 hover:border-purple-200 hover:shadow-md transition-all cursor-pointer text-left"
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={onOpen ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } } : undefined}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold text-purple-700">{initials}</span>
            </div>
            {isActive && (
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 border-2 border-white rounded-full" />
            )}
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">{client.fullName}</p>
            <p className="text-xs text-gray-400">{client.whatsappNumber}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isActive ? (
            <span className="text-xs font-medium px-2 py-1 rounded-full bg-green-50 text-green-700">
              Sending data
            </span>
          ) : (
            <span className="text-xs font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-500">
              Invited
            </span>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              className="text-xs text-gray-400 hover:text-red-600 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 rounded"
              aria-label={`Remove ${client.fullName}`}
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {/* Meal activity */}
      {isActive && (
        <div className="flex items-center gap-3 mb-4 bg-green-50 rounded-xl px-3 py-2">
          <span className="text-base">🍽️</span>
          <div>
            <p className="text-xs font-medium text-green-800">{client.mealCount} meal{client.mealCount !== 1 ? "s" : ""} logged</p>
            {lastMealLabel && <p className="text-xs text-green-600">Last: {lastMealLabel}</p>}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <Stat label="Age" value={client.age ? `${client.age}y` : "—"} />
        <Stat label="Weight" value={client.weightKg ? `${client.weightKg}kg` : "—"} />
        <Stat label="BMI" value={client.bmi ? String(client.bmi) : "—"} />
      </div>

      {/* Goal */}
      {activeGoal ? (
        <div className={`rounded-xl px-3 py-2 ${GOAL_COLORS[activeGoal.goalType] ?? "bg-purple-50 text-purple-700"}`}>
          <p className="text-xs font-semibold mb-0.5">{GOAL_LABELS[activeGoal.goalType] ?? activeGoal.goalType}</p>
          {activeGoal.description && (
            <p className="text-xs opacity-80 line-clamp-1">{activeGoal.description}</p>
          )}
          <div className="flex gap-3 mt-1.5 flex-wrap">
            {activeGoal.targetProteinG && (
              <span className="text-xs opacity-70">{activeGoal.targetProteinG}g protein</span>
            )}
            {activeGoal.targetCaloriesMin && activeGoal.targetCaloriesMax && (
              <span className="text-xs opacity-70">{activeGoal.targetCaloriesMin}–{activeGoal.targetCaloriesMax} kcal</span>
            )}
            {activeGoal.deadline && (
              <span className="text-xs opacity-70">by {new Date(activeGoal.deadline).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-xl px-3 py-2 bg-gray-50 text-gray-400 text-xs">No goal set</div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-xl px-3 py-2 text-center">
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-gray-800">{value}</p>
    </div>
  );
}

function formatRelative(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
