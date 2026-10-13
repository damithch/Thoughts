// Shapes returned by the server's /api/v1 routes (dates arrive as ISO strings).

export type User = { id: number; name: string; email: string };

export type Thought = {
  id: number;
  title: string;
  category: string;
  mood: number;
  tags: string[];
  concept_tags: string[];
  summary: string;
  body: string;
  linked_book_title: string | null;
  linked_idea_text: string | null;
  insight_reflection: string | null;
  created_at: string;
  updated_at: string;
};

export type TaskStatus = "todo" | "in_progress" | "done" | "skipped";
export type TaskPriority = "low" | "medium" | "high";

export type Task = {
  id: number;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  tags: string[];
  note: string;
  scheduled_date: string | null;
  recurring_task_id: number | null;
  rollover_count: number;
};

export type DayRecord = {
  entry_date: string;
  intention: string;
  note: string;
  end_of_day_mood: number | null;
};

export type CheckInEnergy = "low" | "steady" | "high";
export type CheckInFocus = "scattered" | "okay" | "locked_in";

export type CheckIn = {
  id: number;
  mood: number;
  energy: CheckInEnergy;
  focus: CheckInFocus;
  note: string;
  created_at: string;
};

export type TodayResponse = {
  date: string;
  today: string;
  tasks: Task[];
  dayRecord: DayRecord | null;
  checkIns: CheckIn[];
  overdueCount: number;
};
