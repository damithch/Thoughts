export type Thought = {
  id: number;
  title: string;
  category: string;
  mood: number;
  tags: string[];
  summary: string;
  body: string;
  user_id: number | null;
  created_at: Date;
  updated_at: Date;
};

export type User = {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  created_at: Date;
};

export type NewThought = {
  title: string;
  category: string;
  mood: number;
  tags: string[];
  summary: string;
  body: string;
  userId: number;
};

export type UpdateThought = {
  id: number;
  title: string;
  category: string;
  mood: number;
  tags: string[];
  summary: string;
  body: string;
  userId: number;
};

export type DeleteThought = {
  id: number;
  userId: number;
};

export type NewUser = {
  name: string;
  email: string;
  passwordHash: string;
};

export type ThoughtsResult = {
  databaseAvailable: boolean;
  thoughts: Thought[];
};

export type ThoughtActivityDay = {
  date: string;
  total: number;
  average_mood: number;
};

export type TaskStatus = "todo" | "in_progress" | "done" | "skipped";
export type TaskPriority = "low" | "medium" | "high";

export type TaskItem = {
  id: number;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  tags: string[];
  note: string;
  scheduled_date: string;
  recurring_task_id: number | null;
  user_id: number;
  created_at: Date;
  updated_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
};

export type DayRecord = {
  id: number;
  user_id: number;
  entry_date: string;
  intention: string;
  note: string;
  end_of_day_mood: number | null;
  created_at: Date;
  updated_at: Date;
};

export type CheckInEnergy = "low" | "steady" | "high";
export type CheckInFocus = "scattered" | "okay" | "locked_in";

export type RecurringTask = {
  id: number;
  user_id: number;
  title: string;
  priority: TaskPriority;
  tags: string[];
  note: string;
  is_active: boolean;
  days_of_week: string[];
  start_date: string;
  end_date: string | null;
  created_at: Date;
  updated_at: Date;
};

export type TaskCompletionStats = {
  date: string;
  total_tasks: number;
  completed_tasks: number;
  completion_rate: number;
};

export type NewRecurringTask = {
  title: string;
  priority: TaskPriority;
  tags: string[];
  note: string;
  daysOfWeek: string[];
  startDate: string;
  endDate: string | null;
  userId: number;
};

export type UpdateRecurringTask = {
  id: number;
  title: string;
  priority: TaskPriority;
  tags: string[];
  note: string;
  isActive: boolean;
  daysOfWeek: string[];
  startDate: string;
  endDate: string | null;
  userId: number;
};

export type DailyCheckIn = {
  id: number;
  user_id: number;
  entry_date: string;
  mood: number;
  energy: CheckInEnergy;
  focus: CheckInFocus;
  note: string;
  created_at: Date;
};

export type NewTask = {
  title: string;
  priority: TaskPriority;
  tags: string[];
  note: string;
  scheduledDate: string;
  userId: number;
};

export type UpdateTaskStatusInput = {
  id: number;
  status: TaskStatus;
  userId: number;
};

export type UpsertDayRecordInput = {
  entryDate: string;
  intention: string;
  note: string;
  endOfDayMood: number | null;
  userId: number;
};

export type NewDailyCheckIn = {
  entryDate: string;
  mood: number;
  energy: CheckInEnergy;
  focus: CheckInFocus;
  note: string;
  userId: number;
};
