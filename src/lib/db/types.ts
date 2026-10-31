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
  user_id: number | null;
  created_at: Date;
  updated_at: Date;
};

export type BookSourceType = "book" | "article" | "podcast" | "principle";
export type BookIdeaStatus = "understood" | "noticed" | "applied" | "internalized";

export type Book = {
  id: number;
  user_id: number;
  title: string;
  author: string;
  source_type: BookSourceType;
  added_at: Date;
};

export type BookIdea = {
  id: number;
  book_id: number;
  idea_text: string;
  status: BookIdeaStatus;
  created_at: Date;
  updated_at: Date;
  book_title: string;
  book_author: string;
  source_type: BookSourceType;
};

export type User = {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  password_updated_at: Date;
  created_at: Date;
};

export type PasswordResetToken = {
  id: number;
  user_id: number;
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type NewThought = {
  title: string;
  category: string;
  mood: number;
  tags: string[];
  conceptTags: string[];
  summary: string;
  body: string;
  linkedBookIdeaId: number | null;
  insightReflection: string;
  userId: number;
  requestId?: string;
};

export type UpdateThought = {
  id: number;
  title: string;
  category: string;
  mood: number;
  tags: string[];
  conceptTags: string[];
  summary: string;
  body: string;
  linkedBookIdeaId: number | null;
  insightReflection: string;
  userId: number;
};

export type DeleteThought = {
  id: number;
  userId: number;
};

export type SetThoughtHiddenState = {
  id: number;
  userId: number;
  isHidden: boolean;
};

export type NewUser = {
  name: string;
  email: string;
  passwordHash: string;
};

export type NewBook = {
  title: string;
  author: string;
  sourceType: BookSourceType;
  userId: number;
};

export type NewBookIdea = {
  bookId: number;
  ideaText: string;
  status: BookIdeaStatus;
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
  // null = an undated task in the Inbox.
  scheduled_date: string | null;
  recurring_task_id: number | null;
  // How many times this task was pushed to a later day while still open.
  rollover_count: number;
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
  // Optional phone reminder time, "HH:MM".
  remind_at: string | null;
  created_at: Date;
  updated_at: Date;
};

export type TaskCompletionStats = {
  date: string;
  // Excludes skipped tasks.
  total_tasks: number;
  // Done tasks only.
  completed_tasks: number;
  skipped_tasks: number;
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
  remindAt?: string | null;
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
  // Leave out to keep the current reminder; null removes it.
  remindAt?: string | null;
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
  // null puts the task in the Inbox.
  scheduledDate: string | null;
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

export type BehaviouralActivationStatus = "pending" | "completed";

export type BehaviouralActivationEntry = {
  id: number;
  user_id: number;
  activity: string;
  entry_date: string;
  before_depression: number | null;
  before_pleasure: number | null;
  before_achievement: number | null;
  after_depression: number | null;
  after_pleasure: number | null;
  after_achievement: number | null;
  status: BehaviouralActivationStatus;
  created_at: Date;
  updated_at: Date;
};

export type AttentionSession = {
  id: number;
  user_id: number;
  session_type: "mundane_task" | "meditation";
  task_name: string;
  entry_date: string;
  started_at: Date;
  duration_minutes: number;
  self_focus_before: number | null;
  self_focus_after: number | null;
  // Always 100 minus the matching self focus (computed by the database).
  task_focus_before: number | null;
  task_focus_after: number | null;
  anchors_used: Array<"touch" | "sight" | "hearing" | "smell" | "taste"> | null;
  mood_before: number | null;
  mood_after: number | null;
  comments: string | null;
  linked_task_id: number | null;
  created_at: Date;
  updated_at: Date;
};

export type AttentionTaskIdea = {
  id: number;
  name: string;
};

export type ConversationSummary = {
  id: number;
  user_id: number;
  conversation_date: string;
  title: string;
  key_topics: string[];
  insights: string;
  action_items: string[];
  mood_context: number | null;
  created_at: Date;
};

export type NewConversationSummary = {
  conversationDate: string;
  title: string;
  keyTopics: string[];
  insights: string;
  actionItems: string[];
  moodContext: number | null;
  userId: number;
};

export type RagDocumentKind =
  | "thought"
  | "book_idea"
  | "conversation_summary"
  | "ba_entry"
  | "day_note"
  | "daily_rollup";

export type RagDocument = {
  id: number;
  user_id: number;
  document_key: string;
  document_kind: RagDocumentKind;
  source_entity_id: string;
  source_date: string | null;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  source_updated_at: Date;
  indexed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  ingestion_status: "pending" | "processing" | "indexed" | "failed";
  ingestion_attempts: number;
  last_ingestion_error: string | null;
  next_retry_at: Date | null;
  last_ingestion_at: Date | null;
};

export type UpdateTaskInput = {
  id: number;
  userId: number;
  title?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  tags?: string[];
  note?: string;
  // null moves the task to the Inbox.
  scheduledDate?: string | null;
};

export type RagDocumentUpsertInput = {
  documentKey: string;
  documentKind: RagDocumentKind;
  sourceEntityId: string;
  sourceDate: string | null;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  sourceUpdatedAt: Date;
  userId: number;
  contentHash?: string;
};

export type UserSettings = {
  // RAG Retrieval
  rag_default_k: number;           // default: 6
  rag_k_thought: number;           // default: 10
  rag_k_summary: number;           // default: 10
  rag_chunk_size: number;          // default: 1500
  rag_chunk_overlap: number;       // default: 200
  rag_enabled_kinds: RagDocumentKind[]; // default: all 6 kinds
  rag_exclude_hidden_thoughts: boolean; // default: true
  rag_custom_prompt: string;       // default: "" (appended to built-in prompt)

  // AI Agent
  agent_temperature: number;       // default: 0.1
  agent_max_tokens: number;        // default: 1024
  agent_custom_prompt: string;     // default: ""
  agent_default_tag: string;       // default: "agent"

  // Smart Capture
  smart_capture_temperature: number; // default: 0.3
  smart_capture_max_tokens: number;  // default: 2048

  // Live Context Panel
  live_context_enabled: boolean;    // default: true
  live_context_debounce_ms: number; // default: 600
  live_context_min_length: number;  // default: 20
  live_context_k: number;           // default: 3

  // Model Selection
  llm_model: string;               // default: "gemini-flash-latest"

  // Support on hard days (the user's own plan; contacts never leave their database)
  support_enabled: boolean;        // default: true
  support_coping_steps: string[];  // default: a short generic list
  support_contacts: SupportContact[]; // default: []
  support_helpline_name: string;   // default: "National Mental Health Helpline"
  support_helpline_phone: string;  // default: "1926" (Sri Lanka, free, 24 hours)

  // Phone reminders (scheduled on the phone; times are "HH:MM" local time)
  reminders_evening_enabled: boolean;  // default: true
  reminders_evening_time: string;      // default: "21:30"
  reminders_thinking_enabled: boolean; // default: true (worry thinking time, while a module is active)
  reminders_morning_enabled: boolean;  // default: true (the morning after a rough patch)
  reminders_morning_time: string;      // default: "09:00"
  reminders_habits_enabled: boolean;   // default: true (routines that have a reminder time)
  reminders_quiet_enabled: boolean;    // default: true
  reminders_quiet_start: string;       // default: "23:00"
  reminders_quiet_end: string;         // default: "07:00"

  // Attention training: guided meditation step lengths in seconds
  attention_observe_seconds: number;   // default: 60
  attention_belly_seconds: number;     // default: 120
  attention_body_seconds: number;      // default: 120

  // Server push
  push_support_alerts: boolean;        // default: true (very low entry written outside the app)
  push_last_support_trigger: string;   // default: "" (newest rough patch already alerted, ISO time)
};

export type SupportContact = { name: string; phone: string };

export type SupportDay = {
  entry_date: string;
  ate: boolean | null;
  slept: boolean | null;
  connected: boolean | null;
  steps_tried: string[];
  breathing_seconds: number;
  dismissed_at: Date | null;
};

// ── Worry Postponement Module ──────────────────────────────

export type WorryModuleStatus = "active" | "completed" | "abandoned";

export type WorryPostponementModule = {
  id: number;
  user_id: number;
  belief_text: string;
  belief_before_pct: number | null;
  belief_after_pct: number | null;
  thinking_time_start: string;
  thinking_time_duration: number;
  thinking_time_place: string;
  prediction_text: string;
  prediction_confidence: number | null;
  reflection_text: string;
  status: WorryModuleStatus;
  created_at: Date;
  updated_at: Date;
  evidence: WorryEvidence[];
  experiment_days: WorryExperimentDay[];
};

export type WorryEvidence = {
  id: number;
  module_id: number;
  side: "for" | "against";
  content: string;
  sort_order: number;
  created_at: Date;
};

export type WorryExperimentDay = {
  id: number;
  module_id: number;
  entry_date: string;
  what_happened: string;
  thinking_time_notes: string;
  controllability: number;
  created_at: Date;
  updated_at: Date;
};

export type WorryPostponedItem = {
  id: number;
  module_id: number;
  entry_date: string;
  content: string;
  created_at: Date;
};

export type NewWorryModule = {
  userId: number;
  beliefText: string;
  beliefBeforePct: number | null;
};

export type UpdateWorryModule = {
  id: number;
  userId: number;
  beliefText?: string;
  beliefBeforePct?: number | null;
  beliefAfterPct?: number | null;
  thinkingTimeStart?: string;
  thinkingTimeDuration?: number;
  thinkingTimePlace?: string;
  predictionText?: string;
  predictionConfidence?: number | null;
  reflectionText?: string;
  status?: WorryModuleStatus;
};

export type NewWorryEvidence = {
  moduleId: number;
  side: "for" | "against";
  content: string;
};

export type UpdateWorryEvidence = {
  id: number;
  moduleId: number;
  content: string;
};

export type UpsertWorryExperimentDay = {
  moduleId: number;
  entryDate: string;
  whatHappened: string;
  thinkingTimeNotes: string;
  controllability: number;
};

export type AnchorNote = {
  id: number;
  user_id: number;
  date: string;
  content: string;
  created_at: Date;
  updated_at: Date;
};

export type NewAnchorNote = {
  userId: number;
  date: string;
  content: string;
};

export type AnchorStreak = {
  currentStreak: number;
  longestStreak: number;
  totalEntries: number;
  hasToday: boolean;
};
