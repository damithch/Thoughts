"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
      details: `AI Task Control Agent initialized for user ${userName}. Ready for natural language commands or preset actions.`,
      status: "info",
    },
  ]);
  const [agentSummary, setAgentSummary] = useState<string>(
    "Agent is active. Enter a command or click a preset action to manage tasks automatically.",
  );

  // New Quick Task state
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState<TaskPriority>("medium");
  const [newTag, setNewTag] = useState("");

  const [isPending, startTransition] = useTransition();

  // Execute Agent Command (Preset or Natural Language)
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

  // Directly update task status
  async function handleStatusChange(taskId: number, newStatus: TaskStatus) {
    try {
      const response = await fetch("/api/mcp", {
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

      // Optimistic update
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)),
      );

      setAgentLogs((prev) => [
        {
          tool: "update_task_status",
          details: `Manually updated task #${taskId} status to "${newStatus}"`,
          status: "success",
        },
        ...prev,
      ]);
    } catch (err) {
      console.error(err);
    }
  }

  // Directly delete task
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

  // Handle Quick Add Task
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
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 sm:p-6 md:p-8">
      {/* Header */}
      <header className="relative overflow-hidden rounded-[2.5rem] border border-cyan-950/15 bg-slate-900 p-6 text-white shadow-2xl backdrop-blur-xl sm:p-8">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-emerald-500/20 blur-3xl" />

        <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-950/60 px-3.5 py-1 text-xs uppercase tracking-[0.25em] text-cyan-300">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-400"></span>
              </span>
              AI Task Agent Active
            </div>
            <h1 className="mt-3 font-[family:var(--font-display)] text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
              Task Control Center
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-300">
              Use natural language or quick presets to command your agent, automate daily workflows, roll forward unfinished tasks, and monitor task completion.
            </p>
          </div>

          {/* Navigation Controls */}
          <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm">
            <Link
              href="/dashboard/today"
              className="rounded-full border border-white/20 bg-white/10 px-4 py-2.5 font-medium text-white transition-all hover:bg-white/20 hover:scale-105"
            >
              📅 Today View
            </Link>
            <Link
              href="/dashboard/tasks"
              className="rounded-full border border-white/20 bg-white/10 px-4 py-2.5 font-medium text-white transition-all hover:bg-white/20 hover:scale-105"
            >
              🔄 Recurring Routines
            </Link>
            <Link
              href="/dashboard/completion"
              className="rounded-full border border-white/20 bg-white/10 px-4 py-2.5 font-medium text-white transition-all hover:bg-white/20 hover:scale-105"
            >
              📊 Completion Metrics
            </Link>
            <Link
              href="/dashboard"
              className="rounded-full border border-emerald-500/40 bg-emerald-950/60 px-4 py-2.5 font-medium text-emerald-300 transition-all hover:bg-emerald-900"
            >
              📓 Journal Dashboard
            </Link>
          </div>
        </div>

        {/* Date Selector & Key Metrics Bar */}
        <div className="relative mt-8 grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Target Date</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                const newD = e.target.value;
                setSelectedDate(newD);
                runAgentCommand({ customPrompt: `Fetch tasks for date ${newD}` });
              }}
              className="rounded-xl border border-white/20 bg-slate-800/90 px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-400"
            />
          </div>

          <div className="flex flex-col gap-1 rounded-xl bg-slate-800/50 p-2.5 text-center">
            <span className="text-[11px] uppercase tracking-wider text-slate-400">Total Scheduled</span>
            <span className="font-[family:var(--font-display)] text-2xl font-bold text-white">{totalTasks}</span>
          </div>

          <div className="flex flex-col gap-1 rounded-xl bg-slate-800/50 p-2.5 text-center">
            <span className="text-[11px] uppercase tracking-wider text-slate-400">Completion Rate</span>
            <span className="font-[family:var(--font-display)] text-2xl font-bold text-emerald-400">{completionRate}%</span>
          </div>

          <div className="flex flex-col gap-1 rounded-xl bg-slate-800/50 p-2.5 text-center">
            <span className="text-[11px] uppercase tracking-wider text-slate-400">In Progress</span>
            <span className="font-[family:var(--font-display)] text-2xl font-bold text-amber-400">{inProgressTasks}</span>
          </div>

          <div className="flex flex-col gap-1 rounded-xl bg-slate-800/50 p-2.5 text-center">
            <span className="text-[11px] uppercase tracking-wider text-slate-400">Open High Priority</span>
            <span className="font-[family:var(--font-display)] text-2xl font-bold text-rose-400">{openHighTasks}</span>
          </div>
        </div>
      </header>

      {/* Main Grid: Command Console & Tasks */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left Column: Command Bar & Presets (5 cols) */}
        <div className="flex flex-col gap-6 lg:col-span-5">
          {/* Agent Command Prompt */}
          <div className="rounded-[2rem] border border-stone-200/80 bg-white/90 p-5 shadow-xl backdrop-blur sm:p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-[family:var(--font-display)] text-xl font-bold text-stone-900">
                🤖 Command Agent
              </h2>
              {isProcessing && (
                <span className="flex items-center gap-1.5 text-xs text-cyan-700 font-medium">
                  <span className="h-2 w-2 animate-ping rounded-full bg-cyan-600" /> Executing...
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-stone-500">
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
              <div className="relative">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder='e.g., "Complete all high priority tasks", "Roll forward open tasks from yesterday", "Add workout task for 7am"'
                  rows={3}
                  className="w-full rounded-2xl border border-stone-300/80 bg-stone-50/80 p-3 text-sm text-stone-900 placeholder-stone-400 shadow-inner transition-all focus:border-cyan-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                />
              </div>

              <button
                type="submit"
                disabled={isProcessing || !prompt.trim()}
                className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-900 to-emerald-900 px-5 py-3 font-medium text-white shadow-md transition-all hover:from-cyan-800 hover:to-emerald-800 disabled:opacity-50"
              >
                {isProcessing ? "Processing Command..." : "⚡ Execute Agent Command"}
              </button>
            </form>

            {/* Quick Action Presets */}
            <div className="mt-6 border-t border-stone-200/80 pt-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                Agent Action Presets
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button
                  onClick={() => runAgentCommand({ action: "auto_plan" })}
                  disabled={isProcessing}
                  className="flex items-center gap-2.5 rounded-xl border border-cyan-200 bg-cyan-50/70 p-3 text-left text-xs font-semibold text-cyan-950 transition-all hover:bg-cyan-100 hover:shadow-sm"
                >
                  <span className="text-base">🎯</span>
                  <div>
                    <div>Auto-Plan Day</div>
                    <div className="text-[10px] font-normal text-cyan-800">Roll forward & apply rules</div>
                  </div>
                </button>

                <button
                  onClick={() => runAgentCommand({ action: "complete_high_priority" })}
                  disabled={isProcessing}
                  className="flex items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50/70 p-3 text-left text-xs font-semibold text-rose-950 transition-all hover:bg-rose-100 hover:shadow-sm"
                >
                  <span className="text-base">⚡</span>
                  <div>
                    <div>Finish High Priority</div>
                    <div className="text-[10px] font-normal text-rose-800">Complete urgent open tasks</div>
                  </div>
                </button>

                <button
                  onClick={() => runAgentCommand({ action: "roll_forward" })}
                  disabled={isProcessing}
                  className="flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-left text-xs font-semibold text-amber-950 transition-all hover:bg-amber-100 hover:shadow-sm"
                >
                  <span className="text-base">⏩</span>
                  <div>
                    <div>Roll Forward</div>
                    <div className="text-[10px] font-normal text-amber-800">Carry over yesterday's tasks</div>
                  </div>
                </button>

                <button
                  onClick={() => runAgentCommand({ action: "apply_routines" })}
                  disabled={isProcessing}
                  className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-left text-xs font-semibold text-emerald-950 transition-all hover:bg-emerald-100 hover:shadow-sm"
                >
                  <span className="text-base">🔄</span>
                  <div>
                    <div>Apply Routines</div>
                    <div className="text-[10px] font-normal text-emerald-800">Generate active templates</div>
                  </div>
                </button>
              </div>
            </div>
          </div>

          {/* Quick Create Task Form */}
          <div className="rounded-[2rem] border border-stone-200/80 bg-white/90 p-5 shadow-xl backdrop-blur sm:p-6">
            <h3 className="font-[family:var(--font-display)] text-lg font-bold text-stone-900">
              ➕ Quick Task Addition
            </h3>
            <form onSubmit={handleQuickAdd} className="mt-3 flex flex-col gap-3">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Task title..."
                className="w-full rounded-xl border border-stone-300/80 p-2.5 text-sm text-stone-900 focus:border-cyan-600 focus:outline-none"
              />
              <div className="flex gap-2">
                <select
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value as TaskPriority)}
                  className="rounded-xl border border-stone-300/80 p-2 text-xs text-stone-900 focus:outline-none"
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
                  className="w-full rounded-xl border border-stone-300/80 p-2 text-xs text-stone-900 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="rounded-xl bg-stone-900 py-2.5 text-xs font-semibold text-white transition-all hover:bg-stone-800"
              >
                Add Task to {selectedDate}
              </button>
            </form>
          </div>

          {/* Agent Activity Console Log */}
          <div className="rounded-[2rem] border border-stone-200/80 bg-stone-950 p-5 text-stone-100 shadow-xl backdrop-blur sm:p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-[family:var(--font-display)] text-base font-bold text-emerald-400">
                💻 Agent Action Log
              </h3>
              <span className="text-[10px] uppercase tracking-widest text-stone-400">{agentLogs.length} events</span>
            </div>

            <div className="mt-3 rounded-xl border border-stone-800 bg-stone-900/80 p-3 text-xs leading-relaxed text-stone-300">
              <p className="font-semibold text-cyan-300">Summary:</p>
              <p className="mt-1">{agentSummary}</p>
            </div>

            <div className="mt-4 max-h-56 overflow-y-auto space-y-2 pr-1 text-xs">
              {agentLogs.map((log, idx) => (
                <div
                  key={idx}
                  className="flex flex-col gap-0.5 rounded-lg border border-stone-800 bg-stone-900/60 p-2.5 font-mono text-[11px]"
                >
                  <div className="flex items-center justify-between text-stone-400">
                    <span className="font-bold text-cyan-400">tool: {log.tool}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-sans ${
                        log.status === "success"
                          ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                          : log.status === "warning"
                          ? "bg-rose-950 text-rose-300 border border-rose-800"
                          : "bg-cyan-950 text-cyan-300 border border-cyan-800"
                      }`}
                    >
                      {log.status}
                    </span>
                  </div>
                  <div className="text-stone-300">{log.details}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Interactive Tasks Board (7 cols) */}
        <div className="flex flex-col gap-6 lg:col-span-7">
          <div className="rounded-[2rem] border border-stone-200/80 bg-white/90 p-5 shadow-xl backdrop-blur sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-[family:var(--font-display)] text-2xl font-bold text-stone-900">
                  Task Execution Board
                </h2>
                <p className="text-xs text-stone-500">
                  Showing {filteredTasks.length} task(s) for <span className="font-semibold text-stone-800">{selectedDate}</span>
                </p>
              </div>

              {/* Filter Tabs */}
              <div className="flex flex-wrap gap-1.5 rounded-xl border border-stone-200 bg-stone-100/80 p-1 text-xs">
                {(["all", "todo", "in_progress", "done", "high"] as const).map((filterKey) => (
                  <button
                    key={filterKey}
                    onClick={() => setActiveFilter(filterKey)}
                    className={`rounded-lg px-3 py-1.5 capitalize transition-all ${
                      activeFilter === filterKey
                        ? "bg-white font-semibold text-stone-900 shadow-sm"
                        : "text-stone-600 hover:text-stone-900"
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
                <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50/50 p-8 text-center text-stone-500">
                  <p className="text-base font-semibold text-stone-700">No tasks match filter for {selectedDate}</p>
                  <p className="mt-1 text-xs">Use the Command Agent or Quick Add form to schedule tasks.</p>
                </div>
              ) : (
                filteredTasks.map((task) => (
                  <div
                    key={task.id}
                    className={`group relative flex flex-col gap-3 rounded-2xl border p-4 transition-all hover:shadow-md sm:flex-row sm:items-center sm:justify-between ${
                      task.status === "done"
                        ? "border-emerald-200/80 bg-emerald-50/30 text-stone-500"
                        : task.status === "in_progress"
                        ? "border-amber-200/90 bg-amber-50/40 text-stone-900"
                        : "border-stone-200/80 bg-white text-stone-900"
                    }`}
                  >
                    <div className="flex items-start gap-3 sm:items-center">
                      {/* Status Toggle Button */}
                      <button
                        onClick={() => {
                          const nextStatus: TaskStatus =
                            task.status === "todo"
                              ? "in_progress"
                              : task.status === "in_progress"
                              ? "done"
                              : "todo";
                          handleStatusChange(task.id, nextStatus);
                        }}
                        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-all sm:mt-0 ${
                          task.status === "done"
                            ? "border-emerald-600 bg-emerald-600 text-white"
                            : task.status === "in_progress"
                            ? "border-amber-500 bg-amber-50 text-amber-700 font-bold"
                            : "border-stone-300 bg-stone-50 hover:border-stone-400"
                        }`}
                        title="Click to cycle status: Todo -> In Progress -> Done"
                      >
                        {task.status === "done" ? "✓" : task.status === "in_progress" ? "⋯" : ""}
                      </button>

                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`font-medium ${
                              task.status === "done" ? "line-through text-stone-400" : "text-stone-900"
                            }`}
                          >
                            {task.title}
                          </span>

                          {/* Priority Badge */}
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                              task.priority === "high"
                                ? "bg-rose-100 text-rose-800 border border-rose-200"
                                : task.priority === "medium"
                                ? "bg-amber-100 text-amber-800 border border-amber-200"
                                : "bg-slate-100 text-slate-700 border border-slate-200"
                            }`}
                          >
                            {task.priority}
                          </span>

                          {/* Recurring Indicator */}
                          {task.recurring_task_id && (
                            <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-medium text-cyan-800 border border-cyan-200">
                              🔄 Routine
                            </span>
                          )}
                        </div>

                        {task.note && <p className="mt-1 text-xs text-stone-500">{task.note}</p>}

                        {task.tags && task.tags.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {task.tags.map((t, idx) => (
                              <span key={idx} className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-600">
                                #{t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions & Status Select */}
                    <div className="flex items-center gap-2 text-xs">
                      <select
                        value={task.status}
                        onChange={(e) => handleStatusChange(task.id, e.target.value as TaskStatus)}
                        className="rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-xs text-stone-800 focus:outline-none"
                      >
                        <option value="todo">Todo</option>
                        <option value="in_progress">In Progress</option>
                        <option value="done">Done</option>
                        <option value="skipped">Skipped</option>
                      </select>

                      <button
                        onClick={() => handleDeleteTask(task.id)}
                        className="rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-rose-700 transition-all hover:bg-rose-100"
                        title="Delete task"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recurring Routines Summary Drawer */}
          <div className="rounded-[2rem] border border-stone-200/80 bg-white/90 p-5 shadow-xl backdrop-blur sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-[family:var(--font-display)] text-lg font-bold text-stone-900">
                  🔄 Active Recurring Templates ({recurringTasks.filter((r) => r.is_active).length})
                </h3>
                <p className="text-xs text-stone-500">
                  Rules used by the agent to auto-generate daily routines.
                </p>
              </div>
              <Link
                href="/dashboard/tasks"
                className="rounded-xl border border-cyan-800 bg-cyan-950 px-3.5 py-2 text-xs font-semibold text-cyan-50 transition-all hover:bg-cyan-900"
              >
                Manage Routines
              </Link>
            </div>

            <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
              {recurringTasks.map((rec) => (
                <div
                  key={rec.id}
                  className={`flex flex-col gap-1 rounded-xl border p-3 text-xs ${
                    rec.is_active ? "border-stone-200 bg-stone-50/80" : "border-stone-200/50 bg-stone-100/40 opacity-60"
                  }`}
                >
                  <div className="flex items-center justify-between font-medium text-stone-900">
                    <span>{rec.title}</span>
                    <span className="uppercase text-[10px] font-bold text-stone-500">{rec.priority}</span>
                  </div>
                  <div className="text-[10px] text-stone-500">
                    Schedule: {rec.days_of_week.join(", ").toUpperCase()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
