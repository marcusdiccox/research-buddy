export interface Project {
  id: string;
  name: string;
  ticker: string;
  createdAt: string;
}
export interface Note {
  id: string;
  projectId: string;
  revisionId: string;
  title: string;
  body: string;
  url: string;
  publishedOn: string;
  createdAt: string;
  updatedAt: string;
}
export interface Citation {
  revisionId: string;
  quote: string;
}
export interface Takeaway {
  text: string;
  citation: Citation;
}
export interface ResearchResult {
  id: string;
  projectId: string;
  noteId?: string;
  title: string;
  kind: 'summary' | 'answer';
  mode: 'local' | 'ai';
  points: Takeaway[];
  openQuestions: string[];
  createdAt: string;
}
export interface Reminder {
  id: string;
  projectId: string;
  title: string;
  details: string;
  dueAt: string;
  durationMinutes: number;
  completed: boolean;
  notifiedAt: string | null;
  notificationAttemptAt?: string | null;
  notificationRetryAt?: string | null;
  notificationFailures?: number;
  notificationError?: boolean;
  createdAt: string;
}
export interface JournalEntry {
  id: string;
  entryId: string;
  projectId: string;
  thesis: string;
  counterarguments: string;
  conditions: string;
  evidence: Citation[];
  createdAt: string;
}
export interface Settings {
  petVisible: boolean;
  alwaysOnTop: boolean;
  petX?: number;
  petY?: number;
  notifications: boolean;
  providerConsent: boolean;
}
export interface Snapshot {
  projects: Project[];
  notes: Note[];
  reminders: Reminder[];
  journal: JournalEntry[];
  results: ResearchResult[];
  settings: Settings;
  hasApiKey: boolean;
}
export interface NoteDraft {
  id?: string;
  projectId: string;
  title: string;
  body: string;
  url?: string;
  publishedOn?: string;
}
export interface ReminderDraft {
  id?: string;
  projectId?: string;
  title: string;
  details?: string;
  dueAt: string;
  durationMinutes: number;
}
export interface JournalDraft {
  entryId?: string;
  projectId: string;
  thesis: string;
  counterarguments: string;
  conditions: string;
  evidence: Citation[];
}
export interface BuddyAPI {
  call<T = unknown>(action: string, data?: unknown): Promise<T>;
  onChange(handler: () => void): () => void;
}
declare global {
  interface Window {
    buddy?: BuddyAPI;
  }
}
