"use client";

import React, { useState } from "react";
import type { GymClient } from "@/app/(gym)/gym/dashboard/actions";
import { ClientCard } from "./ClientCard";
import { AddClientModal } from "./AddClientModal";
import { useRouter } from "next/navigation";

interface GymDashboardClientProps {
  coachName: string;
  coachEmail: string;
  workspaceId: string;
  clients: GymClient[];
}

export function GymDashboardClient({ coachName, coachEmail, workspaceId, clients }: GymDashboardClientProps) {
  const [showModal, setShowModal] = useState(false);
  const router = useRouter();

  function handleAdded() {
    router.refresh();
  }

  const activeCount = clients.length;
  const goalsSet = clients.filter((c) => c.goals.some((g) => g.status === "active")).length;
  const invitedCount = clients.filter((c) => c.inviteSentAt).length;

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Nav */}
      <header className="bg-white border-b border-gray-100 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center">
              <span className="text-white text-sm font-bold">C</span>
            </div>
            <span className="font-bold text-gray-900">Tistra Coach</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 hidden sm:block">{coachEmail}</span>
            <form action="/auth/signout" method="post">
              <button type="submit" className="text-sm text-gray-500 hover:text-gray-800 font-medium">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">

        {/* Page header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">
              {coachName ? `Welcome, ${coachName.split(" ")[0]}` : "Your dashboard"}
            </h1>
            <p className="text-gray-500 text-sm">
              {activeCount === 0
                ? "Add your first client to get started."
                : `${activeCount} client${activeCount !== 1 ? "s" : ""}`}
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="bg-purple-600 text-white font-semibold rounded-full px-5 py-2.5 text-sm hover:bg-purple-700 transition-colors shadow-sm flex items-center gap-2"
          >
            <span className="text-lg leading-none">+</span> Add client
          </button>
        </div>

        {/* Stats */}
        {activeCount > 0 && (
          <div className="grid grid-cols-3 gap-4 mb-8">
            <StatCard label="Total clients" value={activeCount} />
            <StatCard label="Goals set" value={goalsSet} />
            <StatCard label="Invited" value={invitedCount} />
          </div>
        )}

        {/* Empty state */}
        {activeCount === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="w-20 h-20 rounded-2xl bg-purple-50 flex items-center justify-center mb-6 text-4xl">
              🏋️
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">No clients yet</h2>
            <p className="text-gray-500 text-sm max-w-xs mb-8">
              Add a client and send them a WhatsApp invite. They just need to reply with their first meal.
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="bg-purple-600 text-white font-semibold rounded-full px-8 py-4 text-sm hover:bg-purple-700 transition-colors shadow-lg shadow-purple-100"
            >
              Add your first client
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {clients.map((client) => (
              <button
                key={client.id}
                onClick={() => router.push(`/gym/dashboard/clients/${client.id}`)}
                className="text-left w-full"
              >
                <ClientCard client={client} />
              </button>
            ))}
          </div>
        )}
      </main>

      {showModal && (
        <AddClientModal
          workspaceId={workspaceId}
          coachName={coachName || coachEmail}
          onClose={() => setShowModal(false)}
          onAdded={handleAdded}
        />
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
