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
    <main className="min-h-screen overflow-hidden bg-[linear-gradient(180deg,#eef8ee_0%,#dbeed9_52%,#c9dfc6_100%)] px-4 py-6 text-stone-900 sm:px-6 sm:py-10">
      <AgentTaskControlCenter
        initialDate={targetDate}
        initialTasks={initialTasks}
        initialRecurringTasks={initialRecurringTasks}
        userName={currentUser.name}
      />
    </main>
  );
}
