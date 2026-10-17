// Shapes returned by the server's API routes (dates arrive as ISO strings).

export type User = { id: number; name: string; email: string };

export type Thought = {
  id: number;
  title: string;
  category: string;
  mood: number;
  is_hidden: boolean;
  tags: string[];
  concept_tags: string[];
  summary: string;
  body: string;
  linked_book_idea_id: number | null;
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
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
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

export type ConversationSummary = {
  id: number;
  conversation_date: string;
  title: string;
  key_topics: string[];
  insights: string;
  action_items: string[];
  mood_context: number | null;
  created_at: string;
};

export type AnchorNote = { id: number; date: string; content: string; created_at: string; updated_at: string };

export type AnchorStreak = {
  currentStreak: number;
  longestStreak: number;
  totalEntries: number;
  hasToday: boolean;
};

export type SupportStatus = {
  active: boolean;
  reason: "low_run" | "late_night" | null;
  lateNight: boolean;
  lowStreak: number;
  triggeredAt: string | null;
};

export type SupportContact = { name: string; phone: string };

export type SupportOverview = {
  status: SupportStatus;
  today: {
    date: string;
    ate: boolean | null;
    slept: boolean | null;
    connected: boolean | null;
    stepsTried: string[];
    breathingSeconds: number;
  };
  plan: {
    enabled: boolean;
    copingSteps: string[];
    contacts: SupportContact[];
    helpline: SupportContact;
  };
};

export type TodayResponse = {
  date: string;
  today: string;
  // Only when viewing today.
  support: SupportStatus | null;
  tasks: Task[];
  dayRecord: DayRecord | null;
  checkIns: CheckIn[];
  overdueCount: number;
  thoughts: Thought[];
  conversations: ConversationSummary[];
  anchorNote: AnchorNote | null;
  worry: {
    module: { id: number; belief_text: string; status: string } | null;
    experiment_day: WorryExperimentDay | null;
    postponed_items: WorryPostponedItem[];
  };
};

export type UpcomingResponse = {
  today: string;
  overdue: Task[];
  days: { date: string; tasks: Task[]; pendingRoutines: string[] }[];
};

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export type Routine = {
  id: number;
  title: string;
  priority: TaskPriority;
  tags: string[];
  note: string;
  is_active: boolean;
  days_of_week: Weekday[];
  start_date: string;
  end_date: string | null;
};

export type RoutineAdherence = { id: number; title: string; done: number; scheduled: number };

export type StatsResponse = {
  today: string;
  streak: { current: number; best: number };
  week: { done: number; total: number; skipped: number; days: { date: string; total: number; done: number }[] };
  history: { date: string; total_tasks: number; completed_tasks: number; skipped_tasks: number; completion_rate: number }[];
  routinesWeek: RoutineAdherence[];
  routinesMonth: RoutineAdherence[];
  slipping: Task[];
  overdue: Task[];
};

export type SourceType = "book" | "article" | "podcast" | "principle";
export type IdeaStatus = "understood" | "noticed" | "applied" | "internalized";

export type InsightSource = { id: number; title: string; author: string; source_type: SourceType; added_at: string };

export type InsightIdea = {
  id: number;
  book_id: number;
  idea_text: string;
  status: IdeaStatus;
  book_title: string;
  book_author: string;
  source_type: SourceType;
  updated_at: string;
};

export type InsightsResponse = { sources: InsightSource[]; ideas: InsightIdea[] };

export type SmartCaptureResult = {
  title: string;
  category: string;
  mood: number;
  tags: string[];
  conceptTags: string[];
  summary: string;
  body: string;
  linkedBookIdeaId: number | null;
  insightReflection: string;
};

export type RagExcerpt = {
  document_key?: string;
  source_entity_id?: string;
  chunk_text: string;
  distance?: number;
  metadata?: { category?: string; mood?: number; created_date?: string; source_date?: string; title?: string };
};

export type AgentLog = { tool: string; details: string; status: "success" | "warning" | "info" };

export type AgentOperation = { description: string; requiresConfirmation: boolean; tool: string } & Record<string, unknown>;

export type AgentUndo = { createdTaskIds: number[]; changedTasks: Task[]; deletedTasks: Task[] };

export type AgentResponse = {
  summaryMessage: string;
  actionLogs: AgentLog[];
  date: string;
  pending?: AgentOperation[];
  undo?: AgentUndo;
};

export type ActivationEntry = {
  id: number;
  activity: string;
  entry_date: string;
  before_depression: number | null;
  before_pleasure: number | null;
  before_achievement: number | null;
  after_depression: number | null;
  after_pleasure: number | null;
  after_achievement: number | null;
  status: "pending" | "completed";
};

export type WorryEvidence = { id: number; side: "for" | "against"; content: string };

export type WorryExperimentDay = {
  id: number;
  entry_date: string;
  what_happened: string;
  thinking_time_notes: string;
  controllability: number;
};

export type WorryPostponedItem = { id: number; entry_date: string; content: string; created_at: string };

export type WorryModule = {
  id: number;
  belief_text: string;
  belief_before_pct: number | null;
  belief_after_pct: number | null;
  thinking_time_start: string;
  thinking_time_duration: number;
  thinking_time_place: string;
  prediction_text: string;
  prediction_confidence: number | null;
  reflection_text: string;
  status: "active" | "completed" | "abandoned";
  evidence: WorryEvidence[];
  experiment_days: WorryExperimentDay[];
};

export type Settings = {
  llm_model: string;
  rag_default_k: number;
  rag_exclude_hidden_thoughts: boolean;
  live_context_enabled: boolean;
  agent_default_tag: string;
  agent_temperature: number;
  smart_capture_temperature: number;
  rag_custom_prompt: string;
  agent_custom_prompt: string;
};

export type SettingsResponse = { settings: Settings; models: { value: string; label: string }[] };
