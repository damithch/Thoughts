// Turns the LLM's proposed operations into validated, executable ones, and decides which need
// the user's confirmation. Pure (no DB, no network) so it can be unit-tested.
import { resolveRelativeDate } from "./dates.ts";
import {
  isValidTaskDate,
  normalizeTaskNote,
  normalizeTaskTags,
  normalizeTaskTitle,
  parseTaskId,
  parseTaskPriorityValue,
  parseTaskStatusValue,
  type ValidTaskPriority,
  type ValidTaskStatus,
} from "./validation.ts";

export type AgentContextTask = {
  id: number;
  title: string;
  status: string;
  priority: string;
  scheduled_date: string | null;
};

export type AgentOperation =
  | { tool: "create_task"; title: string; priority: ValidTaskPriority; date: string | null; note: string; tags: string[] }
  | { tool: "update_task"; taskId: number; title?: string; priority?: ValidTaskPriority; date?: string | null }
  | { tool: "set_status"; taskId: number; status: ValidTaskStatus }
  | { tool: "delete_task"; taskId: number }
  | { tool: "create_thought"; title: string; category: string; mood: number; summary: string; body: string; tags: string[] }
  | { tool: "roll_forward" }
  | { tool: "apply_routines" };

export type PlannedOperation = AgentOperation & {
  description: string;
  requiresConfirmation: boolean;
};

export type AgentPlan = {
  operations: PlannedOperation[];
  rejected: string[];
};

// Changing this many existing tasks in one request counts as a bulk change.
export const BULK_CHANGE_THRESHOLD = 3;

// JSON schema for Gemini structured output (OpenAPI subset, as used by responseSchema).
export const AGENT_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING" },
    operations: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          tool: {
            type: "STRING",
            enum: [
              "create_task",
              "update_task",
              "set_status",
              "delete_task",
              "create_thought",
              "roll_forward",
              "apply_routines",
            ],
          },
          taskId: { type: "INTEGER", nullable: true },
          title: { type: "STRING", nullable: true },
          priority: { type: "STRING", enum: ["low", "medium", "high"], nullable: true },
          status: { type: "STRING", enum: ["todo", "in_progress", "done", "skipped"], nullable: true },
          when: { type: "STRING", nullable: true },
          date: { type: "STRING", nullable: true },
          toInbox: { type: "BOOLEAN", nullable: true },
          note: { type: "STRING", nullable: true },
          tags: { type: "ARRAY", items: { type: "STRING" }, nullable: true },
          category: { type: "STRING", nullable: true },
          mood: { type: "INTEGER", nullable: true },
          summary: { type: "STRING", nullable: true },
          body: { type: "STRING", nullable: true },
        },
        required: ["tool"],
      },
    },
  },
  required: ["summary", "operations"],
} as const;

type RawOperation = Record<string, unknown>;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function formatDay(date: string | null) {
  return date ?? "the Inbox";
}

// Resolve the operation's target date. Code-resolved phrases ("next friday") win over the
// model's own date arithmetic; `undefined` means no date was requested.
function resolveDate(
  raw: RawOperation,
  today: string,
): { ok: true; date: string | null | undefined } | { ok: false; reason: string } {
  if (raw.toInbox === true) {
    return { ok: true, date: null };
  }

  const when = text(raw.when);
  if (when) {
    const resolved = resolveRelativeDate(when, today);
    if (resolved) {
      return { ok: true, date: resolved };
    }
  }

  const date = text(raw.date);
  if (date) {
    return isValidTaskDate(date) ? { ok: true, date } : { ok: false, reason: `"${date}" is not a valid date` };
  }

  if (when) {
    return { ok: false, reason: `couldn't work out the date "${when}"` };
  }

  return { ok: true, date: undefined };
}

export function buildAgentPlan(
  rawOperations: unknown,
  context: { today: string; defaultDate: string; tasks: AgentContextTask[] },
): AgentPlan {
  const operations: PlannedOperation[] = [];
  const rejected: string[] = [];
  const tasksById = new Map(context.tasks.map((task) => [task.id, task]));
  const list = Array.isArray(rawOperations) ? rawOperations : [];

  const knownTask = (raw: RawOperation, tool: string) => {
    const id = parseTaskId(raw.taskId);
    const task = id ? tasksById.get(id) : undefined;
    if (!task) {
      rejected.push(`${tool}: task #${String(raw.taskId)} isn't one of your current tasks.`);
    }
    return task;
  };

  for (const item of list) {
    const raw = (item && typeof item === "object" ? item : {}) as RawOperation;
    const tool = text(raw.tool);

    if (tool === "create_task") {
      const title = normalizeTaskTitle(raw.title);
      const priority = raw.priority == null ? "medium" : parseTaskPriorityValue(raw.priority);
      const date = resolveDate(raw, context.today);

      if (!title) {
        rejected.push("create_task: no title given.");
      } else if (!priority) {
        rejected.push(`create_task "${title}": "${String(raw.priority)}" is not a priority.`);
      } else if (!date.ok) {
        rejected.push(`create_task "${title}": ${date.reason}.`);
      } else {
        const target = date.date === undefined ? context.defaultDate : date.date;
        operations.push({
          tool,
          title,
          priority,
          date: target,
          note: normalizeTaskNote(raw.note),
          tags: normalizeTaskTags(raw.tags),
          description: `Create "${title}" on ${formatDay(target)} (${priority})`,
          requiresConfirmation: false,
        });
      }
    } else if (tool === "update_task") {
      const task = knownTask(raw, tool);
      if (!task) continue;
      const title = raw.title == null ? undefined : normalizeTaskTitle(raw.title) || undefined;
      const priority = raw.priority == null ? undefined : parseTaskPriorityValue(raw.priority) ?? undefined;
      const date = resolveDate(raw, context.today);

      if (!date.ok) {
        rejected.push(`update_task "${task.title}": ${date.reason}.`);
        continue;
      }
      if (title === undefined && priority === undefined && date.date === undefined) {
        rejected.push(`update_task "${task.title}": nothing to change.`);
        continue;
      }

      const changes = [
        title !== undefined ? `rename to "${title}"` : null,
        priority !== undefined ? `priority ${priority}` : null,
        date.date !== undefined ? `move to ${formatDay(date.date)}` : null,
      ].filter(Boolean);
      operations.push({
        tool,
        taskId: task.id,
        ...(title !== undefined ? { title } : {}),
        ...(priority !== undefined ? { priority } : {}),
        ...(date.date !== undefined ? { date: date.date } : {}),
        description: `Update "${task.title}": ${changes.join(", ")}`,
        requiresConfirmation: false,
      });
    } else if (tool === "set_status") {
      const task = knownTask(raw, tool);
      if (!task) continue;
      const status = parseTaskStatusValue(raw.status ?? "done");
      if (!status) {
        rejected.push(`set_status "${task.title}": "${String(raw.status)}" is not a status.`);
        continue;
      }
      operations.push({
        tool,
        taskId: task.id,
        status,
        description: `Mark "${task.title}" ${status.replace("_", " ")}`,
        requiresConfirmation: false,
      });
    } else if (tool === "delete_task") {
      const task = knownTask(raw, tool);
      if (!task) continue;
      operations.push({
        tool,
        taskId: task.id,
        description: `Delete "${task.title}"${task.scheduled_date ? ` (${task.scheduled_date})` : ""}`,
        requiresConfirmation: true,
      });
    } else if (tool === "create_thought") {
      const summary = text(raw.summary) || text(raw.body);
      const title = normalizeTaskTitle(raw.title) || summary.slice(0, 100);
      const mood = typeof raw.mood === "number" && Number.isInteger(raw.mood) && raw.mood >= 1 && raw.mood <= 10 ? raw.mood : 6;
      if (!title || !summary) {
        rejected.push("create_thought: needs some text.");
        continue;
      }
      const tags = normalizeTaskTags(raw.tags);
      operations.push({
        tool,
        title,
        category: text(raw.category) || "Reflection",
        mood,
        summary,
        body: text(raw.body) || summary,
        tags: tags.length > 0 ? tags : ["agent-capture"],
        description: `Capture thought "${title}"`,
        requiresConfirmation: false,
      });
    } else if (tool === "roll_forward") {
      operations.push({
        tool,
        description: `Move every overdue task onto ${context.defaultDate}`,
        // Moves an unknown number of tasks at once.
        requiresConfirmation: true,
      });
    } else if (tool === "apply_routines") {
      operations.push({ tool, description: `Add routines to ${context.defaultDate}`, requiresConfirmation: false });
    } else if (tool) {
      rejected.push(`"${tool}" is not something the agent can do.`);
    }
  }

  // Bulk changes to existing tasks need confirmation as a group.
  const changesExisting = operations.filter((op) => op.tool === "update_task" || op.tool === "set_status");
  if (changesExisting.length >= BULK_CHANGE_THRESHOLD) {
    for (const op of changesExisting) {
      op.requiresConfirmation = true;
    }
  }

  return { operations, rejected };
}
