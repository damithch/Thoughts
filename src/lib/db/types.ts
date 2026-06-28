export type Thought = {
  id: number;
  title: string;
  category: string;
  mood: number;
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
  created_at: Date;
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
