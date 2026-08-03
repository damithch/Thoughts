import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { getRecurringTasksByUser, getTasksByUserAndDate } from "@/lib/db";
import { getCurrentColomboDate } from "@/lib/time";

import { AgentTaskControlCenter } from "./AgentTaskControlCenter";

export const dynamic = "force-dynamic";

type AgentPageProps = {
  searchParams?: Promise<{
    date?: string;
  }>;
};

export default async function AgentPage({ searchParams }: AgentPageProps) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  const params = await searchParams;
  const targetDate = params?.date || getCurrentColomboDate();

  const [initialTasks, initialRecurringTasks] = await Promise.all([
    getTasksByUserAndDate(currentUser.id, targetDate),
    getRecurringTasksByUser(currentUser.id),
  ]);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f0f7f4_0%,#e1ede8_50%,#d2e3dc_100%)] text-stone-900">
      <AgentTaskControlCenter
        initialDate={targetDate}
        initialTasks={initialTasks}
        initialRecurringTasks={initialRecurringTasks}
        userName={currentUser.name}
      />
    </main>
  );
}
