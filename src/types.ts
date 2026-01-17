/**
 * Type definitions for Granola CLI
 */

export interface Person {
  id?: string;
  name?: string;
  email?: string;
  company_name?: string;
  job_title?: string;
  avatar?: string;
}

export interface CalendarEvent {
  id?: string;
  summary?: string;
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
  attendees?: Array<{ email?: string; displayName?: string }>;
}

export interface Document {
  id: string;
  title?: string;
  type?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  notes_markdown?: string;
  notes_plain?: string;
  summary?: string;
  overview?: string;
  people?: Record<string, Person> | Person[];
  google_calendar_event?: CalendarEvent;
  transcript_deleted_at?: string;
  was_trashed?: boolean;
  valid_meeting?: boolean;
  workspace_id?: string;
  user_id?: string;
}

export interface TranscriptSegment {
  id?: string;
  text: string;
  speaker?: string;
  speaker_name?: string;
  start_time?: number;
  end_time?: number;
  confidence?: number;
}

export interface Workspace {
  id: string;
  name?: string;
  created_at?: string;
}

export interface DocumentsResponse {
  docs: Document[];
  next_cursor?: string;
}

export interface WorkspaceResponse {
  workspaces: Workspace[];
}

export interface CacheState {
  documents: Record<string, Document>;
  transcripts?: Record<string, TranscriptSegment[]>;
  events?: CalendarEvent[];
  people?: Record<string, Person>;
  workspaceData?: Workspace;
}

export interface CacheFile {
  cache: string; // JSON string of { state: CacheState, version: number }
}

export interface GranolaConfig {
  workos_tokens?: string; // JSON string
  cognito_tokens?: string; // JSON string (legacy)
}

export interface TokenData {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
}

// CLI Output types
export interface MeetingOutput {
  id: string;
  title: string;
  date: string;
  attendees: string[];
  hasNotes: boolean;
  hasSummary: boolean;
  hasTranscript: boolean;
}

export interface TranscriptOutput {
  id: string;
  title: string;
  segments: TranscriptSegment[];
}
