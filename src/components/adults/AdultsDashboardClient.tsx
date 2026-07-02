"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import type { AdultsContact } from "@/app/(adults)/adults/dashboard/actions";
import { AddContactModal } from "./AddContactModal";

interface Props {
  caregiverName: string;
  caregiverEmail: string;
  workspaceId: string;
  contacts: AdultsContact[];
}

const GOAL_LABELS: Record<string, string> = {
  eat_enough: "Eat enough", enough_protein: "Enough protein", increase_protein: "More protein",
  reduce_carbs: "Fewer carbs", balanced_meals: "Balanced meals", weight_gain: "Weight gain",
  hydration: "Hydration", custom: "Custom",
};

const RELATIONSHIP_EMOJI: Record<string, string> = {
  son: "👨", daughter: "👩", spouse: "💑", parent: "👴", sibling: "🤝", friend: "😊", other: "🧑",
};

export function AdultsDashboardClient({ caregiverName, caregiverEmail, workspaceId, contacts }: Props) {
  const [showModal, setShowModal] = useState(false);
  const router = useRouter();

  const activeCount = contacts.length;
  const sendingData = contacts.filter((c) => c.mealCount > 0).length;

  return (
    <div className="min-h-screen bg-rose-50/40">
      {/* Nav */}
      <header className="bg-white border-b border-gray-100 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-rose-500 flex items-center justify-center">
              <span className="text-white text-sm font-bold">N</span>
            </div>
            <span className="font-bold text-gray-900">Tistra Family</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 hidden sm:block">{caregiverEmail}</span>
            <form action="/auth/signout" method="post">
              <button type="submit" className="text-sm text-gray-500 hover:text-gray-800 font-medium">Sign out</button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">
              {caregiverName ? `Hi, ${caregiverName.split(" ")[0]} 👋` : "Your family"}
            </h1>
            <p className="text-gray-500 text-sm">
              {activeCount === 0 ? "Add someone to get started." : `Keeping an eye on ${activeCount} person${activeCount !== 1 ? "s" : ""}`}
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="bg-rose-600 text-white font-semibold rounded-full px-5 py-2.5 text-sm hover:bg-rose-700 transition-colors shadow-sm flex items-center gap-2"
          >
            <span className="text-lg leading-none">+</span> Add person
          </button>
        </div>

        {activeCount > 0 && (
          <div className="grid grid-cols-2 gap-4 mb-8">
            <StatCard label="People added" value={activeCount} />
            <StatCard label="Sending meals" value={sendingData} />
          </div>
        )}

        {activeCount === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="w-24 h-24 rounded-3xl bg-rose-50 flex items-center justify-center mb-6 text-5xl">👵</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">No one added yet</h2>
            <p className="text-gray-500 text-sm max-w-xs mb-8">
              Add a parent, grandparent, or anyone you want to help stay healthy. They'll send meal photos on WhatsApp and you'll track their nutrition here.
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="bg-rose-600 text-white font-semibold rounded-full px-8 py-4 text-sm hover:bg-rose-700 transition-colors shadow-lg shadow-rose-100"
            >
              Add your first contact
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {contacts.map((contact) => (
              <button
                key={contact.id}
                onClick={() => router.push(`/adults/dashboard/contacts/${contact.id}`)}
                className="text-left w-full"
              >
                <ContactCard contact={contact} />
              </button>
            ))}
          </div>
        )}
      </main>

      {showModal && (
        <AddContactModal
          workspaceId={workspaceId}
          caregiverName={caregiverName || caregiverEmail}
          onClose={() => setShowModal(false)}
          onAdded={() => router.refresh()}
        />
      )}
    </div>
  );
}

function ContactCard({ contact }: { contact: AdultsContact }) {
  const initials = contact.fullName.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
  const activeGoal = contact.goals.find((g) => g.status === "active");
  const isActive = contact.mealCount > 0;
  const emoji = contact.relationship ? (RELATIONSHIP_EMOJI[contact.relationship] ?? "🧑") : "🧑";

  const lastMealLabel = contact.lastMealAt ? formatRelative(new Date(contact.lastMealAt)) : null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 hover:border-rose-200 hover:shadow-md transition-all cursor-pointer">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-11 h-11 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold text-rose-700">{initials}</span>
            </div>
            {isActive && <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 border-2 border-white rounded-full" />}
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">{contact.fullName}</p>
            <p className="text-xs text-gray-400">
              {emoji} {contact.relationship ? contact.relationship.charAt(0).toUpperCase() + contact.relationship.slice(1) : "Contact"}
              {contact.age ? `, ${contact.age}y` : ""}
            </p>
          </div>
        </div>
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${isActive ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
          {isActive ? "Active" : "Invited"}
        </span>
      </div>

      {isActive && (
        <div className="flex items-center gap-2 mb-4 bg-green-50 rounded-xl px-3 py-2">
          <span>🍽️</span>
          <div>
            <p className="text-xs font-medium text-green-800">{contact.mealCount} meal{contact.mealCount !== 1 ? "s" : ""} logged</p>
            {lastMealLabel && <p className="text-xs text-green-600">Last: {lastMealLabel}</p>}
          </div>
        </div>
      )}

      {activeGoal ? (
        <div className="rounded-xl bg-rose-50 px-3 py-2">
          <p className="text-xs font-semibold text-rose-700 mb-0.5">{GOAL_LABELS[activeGoal.goalType] ?? activeGoal.goalType}</p>
          {activeGoal.description && <p className="text-xs text-rose-500 line-clamp-1">{activeGoal.description}</p>}
          <div className="flex gap-3 mt-1.5 flex-wrap text-xs text-rose-500">
            {activeGoal.targetProteinG && <span>{activeGoal.targetProteinG}g protein/day</span>}
            {activeGoal.targetCaloriesMin && <span>min {activeGoal.targetCaloriesMin} kcal</span>}
            {activeGoal.targetMealsPerDay && <span>{activeGoal.targetMealsPerDay} meals/day</span>}
          </div>
        </div>
      ) : (
        <div className="rounded-xl px-3 py-2 bg-gray-50 text-gray-400 text-xs">No goal set</div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 px-5 py-4">
      <p className="text-2xl font-bold text-gray-900 mb-1">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

function formatRelative(date: Date): string {
  const diffMins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}
