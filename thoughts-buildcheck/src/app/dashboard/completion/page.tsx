import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { getTaskCompletionStats, getTaskCompletionStatsForMonth } from "@/lib/db";
import { shiftColomboDate } from "@/lib/time";
import { Toast } from "@/app/components/toast";

type CompletionPageProps = {
  searchParams?: Promise<{
    toast?: string;
    type?: "success" | "error" | "info";
  }>;
};

export default async function TaskCompletionPage(props: CompletionPageProps) {
  const params = await props.searchParams;
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  const today = new Date();
  const currentMonth = today.toISOString().split("T")[0].slice(0, 7); // YYYY-MM format
  const thirtyDaysStats = await getTaskCompletionStats(currentUser.id, 30);
  const monthStats = await getTaskCompletionStatsForMonth(currentUser.id, currentMonth);

  // Calculate overall stats
  const totalTasks = thirtyDaysStats.reduce((sum, day) => sum + day.total_tasks, 0);
  const completedTasks = thirtyDaysStats.reduce((sum, day) => sum + day.completed_tasks, 0);
  const overallCompletionRate =
    totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

  // Get today's stats
  const todayStr = today.toISOString().split("T")[0];
  const todayStats = thirtyDaysStats.find((d) => d.date === todayStr);

  // Find consecutive days streak
  let streak = 0;
  for (let i = thirtyDaysStats.length - 1; i >= 0; i--) {
    if (thirtyDaysStats[i].completion_rate >= 80) {
      streak++;
    } else {
      break;
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      {params?.toast && <Toast message="View task completion" tone={params?.type} />}
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Task Completion Dashboard</h1>
          <p className="text-slate-600">Track your task completion progress and streaks</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-600 text-sm font-medium mb-1">Today's Progress</p>
                <p className="text-3xl font-bold text-blue-600">
                  {todayStats ? `${todayStats.completion_rate}%` : "0%"}
                </p>
                {todayStats && (
                  <p className="text-xs text-slate-500 mt-1">
                    {todayStats.completed_tasks} of {todayStats.total_tasks} tasks
                  </p>
                )}
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <span className="text-2xl">📊</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-600 text-sm font-medium mb-1">Overall Rate (30 days)</p>
                <p className="text-3xl font-bold text-green-600">{overallCompletionRate}%</p>
                <p className="text-xs text-slate-500 mt-1">
                  {completedTasks} of {totalTasks} tasks
                </p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <span className="text-2xl">✅</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-600 text-sm font-medium mb-1">Current Streak</p>
                <p className="text-3xl font-bold text-orange-600">{streak} days</p>
                <p className="text-xs text-slate-500 mt-1">80%+ completion</p>
              </div>
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                <span className="text-2xl">🔥</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-600 text-sm font-medium mb-1">Best Day (Month)</p>
                <p className="text-3xl font-bold text-purple-600">
                  {monthStats && monthStats.length > 0
                    ? Math.max(...monthStats.map((d) => d.completion_rate))
                    : 0}
                  %
                </p>
                <p className="text-xs text-slate-500 mt-1">This month</p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <span className="text-2xl">⭐</span>
              </div>
            </div>
          </div>
        </div>

        {/* Chart Section */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
          <h2 className="text-2xl font-bold text-slate-900 mb-6">Last 30 Days</h2>

          <div className="space-y-4">
            {thirtyDaysStats.map((day) => {
              const date = new Date(day.date);
              const dayName = date.toLocaleDateString("en-US", { weekday: "short" });

              return (
                <div key={day.date} className="flex items-center gap-4">
                  <div className="w-20 flex-shrink-0">
                    <p className="text-sm font-medium text-slate-900">{dayName}</p>
                    <p className="text-xs text-slate-500">{day.date}</p>
                  </div>

                  <div className="flex-1">
                    <div className="bg-slate-200 rounded-full h-8 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all flex items-center justify-center ${
                          day.completion_rate >= 80
                            ? "bg-green-500"
                            : day.completion_rate >= 50
                              ? "bg-yellow-500"
                              : "bg-red-500"
                        }`}
                        style={{ width: `${Math.max(day.completion_rate, 5)}%` }}
                      >
                        {day.completion_rate > 10 && (
                          <span className="text-xs font-bold text-white">
                            {day.completion_rate}%
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="w-32 text-right flex-shrink-0">
                    <p className="text-sm font-medium text-slate-900">
                      {day.completed_tasks}/{day.total_tasks}
                    </p>
                    <p className="text-xs text-slate-500">tasks</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Month Overview */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-2xl font-bold text-slate-900 mb-6">Month Overview ({currentMonth})</h2>

          {monthStats && monthStats.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold text-slate-900 mb-4">Daily Breakdown</h3>
                <div className="space-y-3">
                  {monthStats.map((day) => (
                    <div key={day.date} className="flex justify-between items-center">
                      <span className="text-sm text-slate-600">{day.date}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-slate-200 rounded-full h-2">
                          <div
                            className={`h-full rounded-full ${
                              day.completion_rate >= 80
                                ? "bg-green-500"
                                : day.completion_rate >= 50
                                  ? "bg-yellow-500"
                                  : "bg-red-500"
                            }`}
                            style={{ width: `${day.completion_rate}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium w-12 text-right">
                          {day.completion_rate}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-slate-900 mb-4">Month Statistics</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Total Days</span>
                    <span className="font-semibold text-slate-900">{monthStats.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Days with 80%+ completion</span>
                    <span className="font-semibold text-slate-900">
                      {monthStats.filter((d) => d.completion_rate >= 80).length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Average Completion</span>
                    <span className="font-semibold text-slate-900">
                      {Math.round(
                        monthStats.reduce((sum, d) => sum + d.completion_rate, 0) /
                          monthStats.length
                      )}
                      %
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Best Day</span>
                    <span className="font-semibold text-slate-900">
                      {Math.max(...monthStats.map((d) => d.completion_rate))}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center text-slate-500 py-8">
              <p>No task data available for this month yet.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
