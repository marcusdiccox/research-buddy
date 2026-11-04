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
  calendarSync?: boolean;
}
export interface CalendarStatus {
  configured: boolean;
  connected: boolean;
  autoSync: boolean;
  pending: number;
  error?: string;
  lastSyncAt?: string;
}
export interface CalendarLink {
  id: string;
  eventId?: string;
  fingerprint?: string;
  state: 'pending' | 'synced' | 'error';
  error?: string;
  syncedAt?: string;
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
export interface PetPreferences {
  petAppearance: 'red' | 'arctic' | 'midnight';
  petRoamArea: 'bottom' | 'desktop' | 'parked';
  petJokeStyle: 'wholesome' | 'dad' | 'nerdy';
  petChatter: 'off' | 'quiet' | 'friendly' | 'chatty';
  petReducedMotion: boolean;
  petShortcut: 'Control+Alt+P' | 'Control+Shift+Space' | 'Alt+Shift+P';
}
export interface Settings extends PetPreferences {
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
  companion?: { shortcutAvailable: boolean; activeShortcut: string | null };
  calendar?: CalendarStatus;
}
export interface PetView {
  pose:
    | 'idle'
    | 'walking'
    | 'waving'
    | 'sleeping'
    | 'standing-up'
    | 'sitting-down'
    | 'curling-up'
    | 'waking-up';
  direction: 1 | -1;
  phrase: string | null;
  preferences: PetPreferences;
  shortcutAvailable: boolean;
  activeShortcut: string | null;
  menuOpen: boolean;
}
export interface HitRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  shape: 'rect' | 'ellipse';
}
export type NotebookAction = 'notes' | 'reminder' | 'settings';
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
  calendarSync?: boolean;
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
  onPetState(handler: (state: PetView) => void): () => void;
  onNavigate(handler: (action: NotebookAction) => void): () => void;
}
declare global {
  interface Window {
    buddy?: BuddyAPI;
  }
}
