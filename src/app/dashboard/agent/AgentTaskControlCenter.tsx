"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { logoutAction } from "@/app/actions";
import type { RecurringTask, TaskItem, TaskPriority, TaskStatus } from "@/lib/db";

type ActionLog = {
  tool: string;
  details: string;
  status: "success" | "warning" | "info";
};

type AgentTaskControlCenterProps = {
  initialDate: string;
  initialTasks: TaskItem[];
  initialRecurringTasks: RecurringTask[];
  userName: string;
};

export function AgentTaskControlCenter({
  initialDate,
  initialTasks,
  initialRecurringTasks,
  userName,
}: AgentTaskControlCenterProps) {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [tasks, setTasks] = useState<TaskItem[]>(initialTasks);
  const [recurringTasks, setRecurringTasks] = useState<RecurringTask[]>(initialRecurringTasks);
  const [prompt, setPrompt] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<"all" | TaskStatus | "high">("all");

  const [agentLogs, setAgentLogs] = useState<ActionLog[]>([
    {
      tool: "agent_ready",
      details: `AI Task Control Agent active for ${userName}. Ready to process natural language commands or preset automation.`,
      status: "info",
    },
  ]);
  const [agentSummary, setAgentSummary] = useState<string>(
    "Agent is active. Type a command or pick a preset action to manage tasks automatically.",
  );

  // Quick Add Form state
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState<TaskPriority>("medium");
  const [newTag, setNewTag] = useState("");

  const [isPending, startTransition] = useTransition();

  // Execute Agent Command
  async function runAgentCommand(actionPayload: { action?: string; customPrompt?: string }) {
    setIsProcessing(true);
    try {
      const response = await fetch("/api/agent/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: actionPayload.action,
          prompt: actionPayload.customPrompt || prompt,
          date: selectedDate,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to communicate with AI Task Agent.");
      }

      const data = await response.json();

      if (data.summaryMessage) {
        setAgentSummary(data.summaryMessage);
      }

      if (data.actionLogs && Array.isArray(data.actionLogs)) {
        setAgentLogs((prev) => [...data.actionLogs, ...prev]);
      }

      if (data.tasks) {
        setTasks(data.tasks);
      }

      if (data.recurringTasks) {
        setRecurringTasks(data.recurringTasks);
      }

      if (actionPayload.customPrompt) {
        setPrompt("");
      }

      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      setAgentLogs((prev) => [
        {
          tool: "agent_error",
          details: err instanceof Error ? err.message : "An error occurred executing agent command.",
          status: "warning",
        },
        ...prev,
      ]);
    } finally {
      setIsProcessing(false);
    }
  }

  // Update Task Status
  async function handleStatusChange(taskId: number, newStatus: TaskStatus) {
    try {
      await fetch("/api/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.NEXT_PUBLIC_MCP_API_KEY || "",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method: "tools/call",
          params: {
            name: "update_task_status",
            arguments: { id: taskId, status: newStatus },
          },
        }),
      });

      // Optimistic state update
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)),
      );

      setAgentLogs((prev) => [
        {
          tool: "update_task_status",
          details: `Updated task #${taskId} status to "${newStatus}"`,
          status: "success",
        },
        ...prev,
      ]);
    } catch (err) {
      console.error(err);
    }
  }

  // Delete Task
  async function handleDeleteTask(taskId: number) {
    if (!confirm("Are you sure you want to delete this task?")) return;

    try {
      await fetch("/api/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.NEXT_PUBLIC_MCP_API_KEY || "",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method: "tools/call",
          params: {
            name: "delete_task",
            arguments: { id: taskId },
          },
        }),
      });

      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      setAgentLogs((prev) => [
        {
          tool: "delete_task",
          details: `Deleted task #${taskId}`,
          status: "info",
        },
        ...prev,
      ]);
    } catch (err) {
      console.error(err);
    }
  }

  // Quick Add
  async function handleQuickAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;

    await runAgentCommand({
      customPrompt: `Create a ${newPriority} priority task titled "${newTitle.trim()}" for ${selectedDate}${newTag ? ` with tag ${newTag.trim()}` : ""}`,
    });

    setNewTitle("");
    setNewTag("");
  }

  // Filter Tasks
  const filteredTasks = tasks.filter((t) => {
    if (activeFilter === "all") return true;
    if (activeFilter === "high") return t.priority === "high";
    return t.status === activeFilter;
  });

  // Calculate Metrics
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => t.status === "done").length;
  const openHighTasks = tasks.filter((t) => t.priority === "high" && t.status !== "done" && t.status !== "skipped").length;
  const inProgressTasks = tasks.filter((t) => t.status === "in_progress").length;
  const completionRate = totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 sm:gap-8">
      {/* Header Card */}
      <header className="rounded-[2rem] border border-cyan-950/10 bg-white/70 p-5 shadow-[0_26px_80px_rgba(48,84,53,0.12)] backdrop-blur sm:rounded-[2.5rem] sm:p-6 md:p-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-950/10 bg-cyan-50 px-3.5 py-1 text-xs uppercase tracking-[0.22em] text-cyan-950 font-semibold sm:tracking-[0.25em]">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-600 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-600"></span>
              </span>
              AI Task Agent Active
            </div>
            <h1 className="mt-3 font-[family:var(--font-display)] text-4xl leading-none text-stone-900 sm:text-5xl md:text-6xl">
              Task Control Center
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-700 sm:mt-4 sm:leading-7">
              Command your agent using natural language prompts or quick presets to auto-plan your day, roll forward unfinished tasks, and execute routines.
            </p>

            {/* Target Date Picker */}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <label htmlFor="agent-target-date" className="text-xs font-medium uppercase tracking-[0.16em] text-stone-500">
                Target Date:
              </label>
              <input
                id="agent-target-date"
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  const newD = e.target.value;
                  setSelectedDate(newD);
                  runAgentCommand({ customPrompt: `Fetch tasks for date ${newD}` });
                }}
                className="rounded-full border border-cyan-950/15 bg-white px-4 py-1.5 text-xs font-semibold text-stone-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-cyan-950/20"
              />
            </div>
          </div>

          {/* Navigation Bar */}
          <div className="flex flex-col gap-2 text-sm sm:flex-row sm:flex-wrap">
            <Link
              href="/dashboard/today"
              className="rounded-full border border-emerald-950/10 px-4 py-2.5 text-center text-emerald-950 transition-colors hover:bg-white text-xs font-medium sm:text-sm"
            >
              Today View
            </Link>
            <Link
              href="/dashboard/tasks"
              className="rounded-full border border-blue-950/10 px-4 py-2.5 text-center text-blue-950 transition-colors hover:bg-blue-50 text-xs font-medium sm:text-sm"
            >
              Task Management
            </Link>
            <Link
              href="/dashboard/completion"
              className="rounded-full border border-purple-950/10 px-4 py-2.5 text-center text-purple-950 transition-colors hover:bg-purple-50 text-xs font-medium sm:text-sm"
            >
              Completion Stats
            </Link>
            <Link
              href="/dashboard"
              className="rounded-full border border-emerald-950/10 px-4 py-2.5 text-center text-emerald-950 transition-colors hover:bg-white text-xs font-medium sm:text-sm"
            >
              Journal Dashboard
            </Link>
            <form action={logoutAction} className="w-full sm:w-auto">
              <button
                type="submit"
                className="w-full rounded-full bg-emerald-950 px-4 py-2.5 text-center text-emerald-50 transition-colors hover:bg-emerald-800 text-xs font-medium sm:text-sm"
              >
                Logout
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Metrics Summary Section */}
      <section className="grid gap-3 grid-cols-2 md:grid-cols-4 sm:gap-4">
        <div className="rounded-[1.75rem] border border-cyan-950/10 bg-white/72 p-4 shadow-[0_20px_50px_rgba(48,84,53,0.10)] backdrop-blur sm:p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-cyan-900/70">
            Total Tasks
          </p>
          <p className="mt-2 font-[family:var(--font-display)] text-3xl leading-none text-stone-900 sm:text-4xl">
            {totalTasks}
          </p>
        </div>
        <div className="rounded-[1.75rem] border border-cyan-950/10 bg-white/72 p-4 shadow-[0_20px_50px_rgba(48,84,53,0.10)] backdrop-blur sm:p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-emerald-800/70">
            Completion Rate
          </p>
          <p className="mt-2 font-[family:var(--font-display)] text-3xl leading-none text-emerald-900 sm:text-4xl">
            {completionRate}%
          </p>
        </div>
        <div className="rounded-[1.75rem] border border-cyan-950/10 bg-white/72 p-4 shadow-[0_20px_50px_rgba(48,84,53,0.10)] backdrop-blur sm:p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-amber-800/70">
            In Progress
          </p>
          <p className="mt-2 font-[family:var(--font-display)] text-3xl leading-none text-amber-900 sm:text-4xl">
            {inProgressTasks}
          </p>
        </div>
        <div className="rounded-[1.75rem] border border-cyan-950/10 bg-white/72 p-4 shadow-[0_20px_50px_rgba(48,84,53,0.10)] backdrop-blur sm:p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-rose-800/70">
            Open High Priority
          </p>
          <p className="mt-2 font-[family:var(--font-display)] text-3xl leading-none text-rose-900 sm:text-4xl">
            {openHighTasks}
          </p>
        </div>
      </section>

      {/* Main Interactive Grid */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left Column: Command & Log Console (5 cols) */}
        <div className="flex flex-col gap-6 lg:col-span-5">
          {/* Command Agent Card */}
          <section className="rounded-[1.75rem] border border-cyan-950/10 bg-white/72 p-5 shadow-[0_26px_70px_rgba(48,84,53,0.10)] backdrop-blur sm:rounded-[2rem] sm:p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-[family:var(--font-display)] text-2xl leading-none text-stone-900">
                🤖 Command Agent
              </h2>
              {isProcessing && (
                <span className="flex items-center gap-1.5 text-xs text-cyan-900 font-semibold animate-pulse">
                  <span className="h-2 w-2 rounded-full bg-cyan-600"></span> Executing...
                </span>
              )}
            </div>
            <p className="mt-2 text-xs leading-6 text-stone-600 sm:text-sm">
              Type what you want the agent to do with your tasks for {selectedDate}.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!prompt.trim()) return;
                runAgentCommand({ customPrompt: prompt });
              }}
              className="mt-4 flex flex-col gap-3"
            >
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder='e.g. "Complete all high priority tasks", "Roll forward open tasks from yesterday", "Add workout task for 7am"'
                rows={3}
                className="w-full rounded-2xl border border-cyan-950/15 bg-white/80 p-3.5 text-sm leading-6 text-stone-900 placeholder-stone-400 shadow-inner transition-all focus:border-cyan-950 focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-950/20"
              />

              <button
                type="submit"
                disabled={isProcessing || !prompt.trim()}
                className="w-full rounded-full bg-cyan-950 px-5 py-3 text-center text-sm font-semibold text-cyan-50 shadow-md transition-colors hover:bg-cyan-900 disabled:opacity-50"
              >
                {isProcessing ? "Executing Command..." : "⚡ Execute Agent Command"}
              </button>
            </form>

            {/* Agent Action Presets */}
            <div className="mt-6 border-t border-cyan-950/10 pt-4">
              <p className="text-xs uppercase tracking-[0.18em] text-cyan-900/70 font-semibold">
                Preset Action Commands
              </p>
              <div className="mt-3 grid gap-2 grid-cols-1 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => runAgentCommand({ action: "auto_plan" })}
                  disabled={isProcessing}
                  className="flex items-center gap-2 rounded-2xl border border-cyan-950/10 bg-cyan-50/70 p-3 text-left transition-colors hover:bg-cyan-100 disabled:opacity-50"
                >
                  <span className="text-lg">🎯</span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-cyan-950">Auto-Plan Day</p>
                    <p className="text-[10px] text-stone-600 truncate">Roll forward & apply rules</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => runAgentCommand({ action: "complete_high_priority" })}
                  disabled={isProcessing}
                  className="flex items-center gap-2 rounded-2xl border border-rose-900/10 bg-rose-50/70 p-3 text-left transition-colors hover:bg-rose-100 disabled:opacity-50"
                >
                  <span className="text-lg">⚡</span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-rose-950">Finish High Priority</p>
                    <p className="text-[10px] text-stone-600 truncate">Complete urgent tasks</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => runAgentCommand({ action: "roll_forward" })}
                  disabled={isProcessing}
                  className="flex items-center gap-2 rounded-2xl border border-amber-900/10 bg-amber-50/70 p-3 text-left transition-colors hover:bg-amber-100 disabled:opacity-50"
                >
                  <span className="text-lg">⏩</span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-amber-950">Roll Forward</p>
                    <p className="text-[10px] text-stone-600 truncate">Carry over yesterday</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => runAgentCommand({ action: "apply_routines" })}
                  disabled={isProcessing}
                  className="flex items-center gap-2 rounded-2xl border border-emerald-950/10 bg-emerald-50/70 p-3 text-left transition-colors hover:bg-emerald-100 disabled:opacity-50"
                >
                  <span className="text-lg">🔄</span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-emerald-950">Apply Routines</p>
                    <p className="text-[10px] text-stone-600 truncate">Generate active rules</p>
                  </div>
                </button>
              </div>
            </div>
          </section>

          {/* Quick Task Creation Card */}
          <section className="rounded-[1.75rem] border border-cyan-950/10 bg-white/72 p-5 shadow-[0_26px_70px_rgba(48,84,53,0.10)] backdrop-blur sm:rounded-[2rem] sm:p-6">
            <h3 className="font-[family:var(--font-display)] text-xl leading-none text-stone-900">
              ➕ Quick Task Addition
            </h3>
            <form onSubmit={handleQuickAdd} className="mt-3 flex flex-col gap-3">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Task title..."
                className="w-full rounded-2xl border border-cyan-950/15 bg-white/80 p-3 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-cyan-950/20"
              />
              <div className="flex flex-col gap-2 sm:flex-row">
                <select
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value as TaskPriority)}
                  className="rounded-2xl border border-cyan-950/15 bg-white/80 p-2.5 text-xs text-stone-900 focus:outline-none"
                >
                  <option value="low">Low Priority</option>
                  <option value="medium">Medium Priority</option>
                  <option value="high">High Priority</option>
                </select>
                <input
                  type="text"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="Tag (optional)"
                  className="w-full rounded-2xl border border-cyan-950/15 bg-white/80 p-2.5 text-xs text-stone-900 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-full bg-stone-900 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-white transition-colors hover:bg-stone-800"
              >
                Add Task to {selectedDate}
              </button>
            </form>
          </section>

          {/* Agent Action Log Console Card */}
          <section className="rounded-[1.75rem] border border-cyan-950/20 bg-cyan-950 p-5 text-cyan-50 shadow-xl backdrop-blur sm:rounded-[2rem] sm:p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-[family:var(--font-display)] text-lg leading-none text-emerald-400">
                💻 Agent Activity Log
              </h3>
              <span className="text-[10px] uppercase tracking-[0.18em] text-cyan-200/70">{agentLogs.length} events</span>
            </div>

            <div className="mt-3 rounded-2xl border border-cyan-800/40 bg-cyan-900/50 p-3 text-xs leading-relaxed text-cyan-100">
              <p className="font-semibold text-emerald-300">Summary:</p>
              <p className="mt-1 whitespace-pre-wrap">{agentSummary}</p>
            </div>

            <div className="mt-4 max-h-56 overflow-y-auto space-y-2 pr-1 text-xs">
              {agentLogs.map((log, idx) => (
                <div
                  key={idx}
                  className="flex flex-col gap-1 rounded-xl border border-cyan-900/80 bg-cyan-900/40 p-2.5 font-mono text-[11px]"
                >
                  <div className="flex items-center justify-between text-cyan-300">
                    <span className="font-bold">tool: {log.tool}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[9px] uppercase font-sans font-semibold ${
                        log.status === "success"
                          ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                          : log.status === "warning"
                          ? "bg-rose-950 text-rose-300 border border-rose-800"
                          : "bg-cyan-900 text-cyan-200 border border-cyan-700"
                      }`}
                    >
                      {log.status}
                    </span>
                  </div>
                  <div className="text-cyan-100/90 break-words">{log.details}</div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right Column: Task Execution Board (7 cols) */}
        <div className="flex flex-col gap-6 lg:col-span-7">
          <section className="rounded-[1.75rem] border border-cyan-950/10 bg-white/72 p-5 shadow-[0_26px_70px_rgba(48,84,53,0.10)] backdrop-blur sm:rounded-[2rem] sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-[family:var(--font-display)] text-2xl leading-none text-stone-900 sm:text-3xl">
                  Task Execution Board
                </h2>
                <p className="mt-2 text-xs text-stone-600 sm:text-sm">
                  Showing {filteredTasks.length} task(s) for <span className="font-semibold text-stone-900">{selectedDate}</span>
                </p>
              </div>

              {/* Mobile-Responsive Filter Tabs */}
              <div className="flex flex-wrap gap-1.5 rounded-2xl border border-cyan-950/10 bg-white/80 p-1 text-xs">
                {(["all", "todo", "in_progress", "done", "high"] as const).map((filterKey) => (
                  <button
                    key={filterKey}
                    type="button"
                    onClick={() => setActiveFilter(filterKey)}
                    className={`rounded-xl px-3 py-1.5 capitalize transition-colors ${
                      activeFilter === filterKey
                        ? "bg-cyan-950 font-semibold text-cyan-50 shadow-sm"
                        : "text-stone-700 hover:bg-stone-100"
                    }`}
                  >
                    {filterKey.replace("_", " ")}
                  </button>
                ))}
              </div>
            </div>

            {/* Task List */}
            <div className="mt-6 space-y-3">
              {filteredTasks.length === 0 ? (
                <div className="rounded-[1.5rem] border border-dashed border-cyan-950/15 bg-white/60 p-8 text-center text-stone-600 sm:p-10">
                  <p className="font-[family:var(--font-display)] text-2xl text-stone-900">
                    No tasks match filter for {selectedDate}
                  </p>
                  <p className="mt-3 text-xs leading-6 text-stone-600 sm:text-sm">
                    Use the Command Agent above or Quick Add form to schedule tasks.
                  </p>
                </div>
              ) : (
                filteredTasks.map((task) => (
                  <article
                    key={task.id}
                    className={`rounded-[1.5rem] border p-4 shadow-[0_18px_40px_rgba(48,84,53,0.08)] transition-all ${
                      task.status === "done"
                        ? "border-emerald-900/10 bg-emerald-50/90"
                        : task.status === "in_progress"
                        ? "border-amber-900/10 bg-amber-50/85"
                        : "border-stone-900/10 bg-white/80"
                    }`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-3">
                        {/* Interactive Status Cycle Button */}
                        <button
                          type="button"
                          onClick={() => {
                            const nextStatus: TaskStatus =
                              task.status === "todo"
                                ? "in_progress"
                                : task.status === "in_progress"
                                ? "done"
                                : "todo";
                            handleStatusChange(task.id, nextStatus);
                          }}
                          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-all ${
                            task.status === "done"
                              ? "border-emerald-950 bg-emerald-950 text-white"
                              : task.status === "in_progress"
                              ? "border-amber-700 bg-amber-100 text-amber-950 font-bold"
                              : "border-stone-400 bg-white hover:border-stone-600"
                          }`}
                          title="Click to cycle status: Todo -> In Progress -> Done"
                        >
                          {task.status === "done" ? "✓" : task.status === "in_progress" ? "⋯" : ""}
                        </button>

                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3
                              className={`font-[family:var(--font-display)] text-xl leading-none ${
                                task.status === "done" ? "line-through text-stone-400" : "text-stone-900"
                              }`}
                            >
                              {task.title}
                            </h3>

                            {/* Priority Badge */}
                            <span
                              className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-[0.14em] font-semibold ${
                                task.priority === "high"
                                  ? "bg-rose-100 text-rose-900 border-rose-900/10"
                                  : task.priority === "medium"
                                  ? "bg-amber-100 text-amber-900 border-amber-900/10"
                                  : "bg-stone-100 text-stone-700 border-stone-900/10"
                              }`}
                            >
                              {task.priority}
                            </span>

                            {/* Recurring Routine Indicator */}
                            {task.recurring_task_id && (
                              <span className="rounded-full border border-cyan-950/10 bg-cyan-50 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-cyan-950 font-semibold">
                                🔄 Routine
                              </span>
                            )}
                          </div>

                          {task.note && <p className="mt-2 text-xs leading-6 text-stone-700 sm:text-sm">{task.note}</p>}

                          {task.tags && task.tags.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {task.tags.map((t, idx) => (
                                <span
                                  key={idx}
                                  className="rounded-full border border-emerald-950/10 bg-emerald-50/70 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.14em] text-emerald-950"
                                >
                                  #{t}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Controls: Status Select & Delete */}
                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <select
                          value={task.status}
                          onChange={(e) => handleStatusChange(task.id, e.target.value as TaskStatus)}
                          className="rounded-full border border-emerald-950/10 bg-white px-3 py-1.5 text-xs text-stone-900 focus:outline-none"
                        >
                          <option value="todo">To do</option>
                          <option value="in_progress">In progress</option>
                          <option value="done">Done</option>
                          <option value="skipped">Skipped</option>
                        </select>

                        <button
                          type="button"
                          onClick={() => handleDeleteTask(task.id)}
                          className="rounded-full border border-rose-900/10 bg-rose-50 px-3 py-1.5 text-xs text-rose-900 transition-colors hover:bg-rose-100"
                          title="Delete task"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          {/* Active Recurring Routines Panel */}
          <section className="rounded-[1.75rem] border border-cyan-950/10 bg-white/72 p-5 shadow-[0_26px_70px_rgba(48,84,53,0.10)] backdrop-blur sm:rounded-[2rem] sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-[family:var(--font-display)] text-xl leading-none text-stone-900">
                  🔄 Active Recurring Templates ({recurringTasks.filter((r) => r.is_active).length})
                </h3>
                <p className="mt-2 text-xs text-stone-600 sm:text-sm">
                  Rules used by the agent to auto-generate daily routines.
                </p>
              </div>
              <Link
                href="/dashboard/tasks"
                className="rounded-full border border-blue-950/10 px-4 py-2 text-center text-xs font-semibold text-blue-950 transition-colors hover:bg-blue-50 self-start sm:self-auto"
              >
                Manage Routines
              </Link>
            </div>

            <div className="mt-4 grid gap-3 grid-cols-1 sm:grid-cols-2">
              {recurringTasks.map((rec) => (
                <div
                  key={rec.id}
                  className={`rounded-2xl border p-3.5 text-xs ${
                    rec.is_active
                      ? "border-cyan-950/10 bg-white/80 text-stone-900"
                      : "border-stone-200 bg-stone-100/50 opacity-60 text-stone-500"
                  }`}
                >
                  <div className="flex items-center justify-between font-semibold">
                    <span>{rec.title}</span>
                    <span className="uppercase text-[10px] text-stone-500">{rec.priority}</span>
                  </div>
                  <div className="mt-1.5 text-[11px] text-stone-600">
                    Schedule: <span className="font-semibold">{rec.days_of_week.join(", ").toUpperCase()}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
