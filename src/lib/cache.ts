/**
 * Local cache reader for Granola
 * Reads meeting data directly from the local cache file
 * Optimized for performance with Bun
 */

import { existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { CacheState, Document, Person, TranscriptSegment } from '../types.js';

const CACHE_PATHS = {
  darwin: join(homedir(), 'Library/Application Support/Granola/cache-v3.json'),
  linux: join(homedir(), '.config/Granola/cache-v3.json'),
  win32: join(homedir(), 'AppData/Roaming/Granola/cache-v3.json'),
};

// In-memory cache for parsed data (huge performance win)
let cachedState: CacheState | null = null;
let cacheModTime = 0;

// Pre-compiled regex for word splitting (performance)
const WORD_SPLIT_REGEX = /\s+/;

/**
 * Get the path to Granola's cache file based on platform
 */
export function getCachePath(): string {
  const platform = process.platform as keyof typeof CACHE_PATHS;
  return CACHE_PATHS[platform] || CACHE_PATHS.darwin;
}

/**
 * Load and parse the Granola cache (with in-memory caching)
 * Uses sync read for simplicity - file is local so it's fast
 */
export function loadCache(): CacheState {
  const cachePath = getCachePath();

  if (!existsSync(cachePath)) {
    throw new Error(`Granola cache not found at ${cachePath}. Is Granola installed?`);
  }

  // Check if cache file changed since last load
  const stats = statSync(cachePath);
  const modTime = stats.mtimeMs;

  // Return cached if file hasn't changed
  if (cachedState && modTime === cacheModTime) {
    return cachedState;
  }

  // Read and parse (sync is fine for local file)
  const { readFileSync } = require('node:fs');
  const raw = readFileSync(cachePath, 'utf8');
  const data = JSON.parse(raw);
  const cache = JSON.parse(data.cache);

  cachedState = cache.state;
  cacheModTime = modTime;

  return cachedState as CacheState;
}

/**
 * Get all documents from the cache
 */
export function getDocuments(state?: CacheState): Document[] {
  const cache = state || loadCache();
  return Object.values(cache.documents || {});
}

/**
 * Get meetings (filtered documents)
 */
export function getMeetings(state?: CacheState): Document[] {
  return getDocuments(state).filter((d) => d.type === 'meeting' && !d.was_trashed);
}

/**
 * Find a document by ID or title match
 */
export function findDocument(idOrQuery: string, state?: CacheState): Document | undefined {
  const docs = getDocuments(state);

  // Exact ID match (fast path)
  const byId = docs.find((d) => d.id === idOrQuery);
  if (byId) {
    return byId;
  }

  // Title match (all significant words must match)
  const q = idOrQuery.toLowerCase();
  const words = q.split(WORD_SPLIT_REGEX).filter((w) => w.length > 2);

  return docs
    .filter((d) => {
      const title = (d.title || '').toLowerCase();
      return words.every((w) => title.includes(w));
    })
    .sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime())[0];
}

/**
 * Search documents by query
 */
export function searchDocuments(query: string, state?: CacheState): Document[] {
  const q = query.toLowerCase();
  const docs = getMeetings(state);

  return docs
    .filter((d) => {
      const title = (d.title || '').toLowerCase();
      const notes = (d.notes_plain || '').toLowerCase();
      const peopleArr = getPeopleArray(d.people);
      const people = peopleArr.map((p) => (p?.name || '').toLowerCase()).join(' ');
      return title.includes(q) || notes.includes(q) || people.includes(q);
    })
    .sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime());
}

/**
 * Get transcripts from cache (if available)
 */
export function getTranscripts(state?: CacheState): Record<string, TranscriptSegment[]> {
  const cache = state || loadCache();
  return cache.transcripts || {};
}

/**
 * Get transcript for a specific document
 */
export function getDocumentTranscript(documentId: string, state?: CacheState): TranscriptSegment[] | undefined {
  const transcripts = getTranscripts(state);
  return transcripts[documentId];
}

/**
 * Normalize people field (can be object or array)
 */
export function getPeopleArray(people?: Record<string, Person> | Person[]): Person[] {
  if (!people) {
    return [];
  }
  if (Array.isArray(people)) {
    return people;
  }
  return Object.values(people);
}

/**
 * Get all people from the cache
 */
export function getPeople(state?: CacheState): Person[] {
  const cache = state || loadCache();
  const people = cache.people || {};
  return Object.values(people).filter((p): p is Person => !!p?.name);
}

/**
 * Get unique companies from people
 */
export function getCompanies(state?: CacheState): string[] {
  const people = getPeople(state);
  const companies = people
    .map((p) => (p as Record<string, unknown>)?.company_name as string)
    .filter((c): c is string => !!c);
  return [...new Set(companies)].sort();
}

/**
 * Get folders (document lists) from cache
 */
export function getFolders(state?: CacheState): Array<{
  id: string;
  title: string;
  noteCount: number;
  visibility: string;
  isShared: boolean;
}> {
  const cache = state || loadCache();
  const metadata =
    ((cache as Record<string, unknown>).documentListsMetadata as Record<string, Record<string, unknown>>) || {};
  const lists = ((cache as Record<string, unknown>).documentLists as Record<string, string[]>) || {};

  return Object.values(metadata)
    .filter((f) => f && !f.deleted_at)
    .map((f) => ({
      id: f.id as string,
      title: (f.title as string) || '(untitled)',
      noteCount: (lists[f.id as string] || []).length,
      visibility: (f.visibility as string) || 'private',
      isShared: (f.is_shared as boolean) || false,
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * Get documents in a specific folder
 */
export function getDocumentsByFolder(folderIdOrName: string, state?: CacheState): Document[] {
  const cache = state || loadCache();
  const folders = getFolders(cache);
  const lists = ((cache as Record<string, unknown>).documentLists as Record<string, string[]>) || {};
  const docs = getDocuments(cache);

  const folder = folders.find(
    (f) => f.id === folderIdOrName || f.title.toLowerCase().includes(folderIdOrName.toLowerCase()),
  );

  if (!folder) {
    return [];
  }

  const docIds = new Set(lists[folder.id] || []);
  return docs
    .filter((d) => docIds.has(d.id))
    .sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime());
}

/**
 * Get documents involving a specific person
 */
export function getDocumentsByPerson(personNameOrEmail: string, state?: CacheState): Document[] {
  const q = personNameOrEmail.toLowerCase();
  const meetings = getMeetings(state);

  return meetings
    .filter((d) => {
      // Search in title (fast path)
      if ((d.title || '').toLowerCase().includes(q)) {
        return true;
      }

      // Search in people array
      const peopleArr = getPeopleArray(d.people);
      if (
        peopleArr.some((p) => (p?.name || '').toLowerCase().includes(q) || (p?.email || '').toLowerCase().includes(q))
      ) {
        return true;
      }

      // Search in calendar attendees
      const attendees = d.google_calendar_event?.attendees || [];
      if (
        attendees.some(
          (a) => (a?.displayName || '').toLowerCase().includes(q) || (a?.email || '').toLowerCase().includes(q),
        )
      ) {
        return true;
      }

      // Search in nested people structure
      const peopleObj = d.people as Record<string, unknown> | undefined;
      if (peopleObj) {
        const creator = peopleObj.creator as Record<string, unknown> | undefined;
        if (
          creator?.name?.toString().toLowerCase().includes(q) ||
          creator?.email?.toString().toLowerCase().includes(q)
        ) {
          return true;
        }

        const nestedAttendees = peopleObj.attendees as Array<Record<string, unknown>> | undefined;
        if (
          nestedAttendees?.some(
            (a) => a?.name?.toString().toLowerCase().includes(q) || a?.email?.toString().toLowerCase().includes(q),
          )
        ) {
          return true;
        }
      }

      return false;
    })
    .sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime());
}

/**
 * Get shared documents
 */
export function getSharedDocuments(state?: CacheState): Document[] {
  const cache = state || loadCache();
  const shared = ((cache as Record<string, unknown>).sharedDocuments as Record<string, Document>) || {};
  return Object.values(shared)
    .filter((d): d is Document => !!d?.id)
    .sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime());
}

/**
 * Get current user info from cache/config
 */
export function getCurrentUser(): {
  id: string;
  name: string;
  email: string;
  company?: string;
  title?: string;
  avatar?: string;
  plan?: string;
} | null {
  try {
    const supabasePath = join(homedir(), 'Library/Application Support/Granola/supabase.json');
    if (!existsSync(supabasePath)) {
      return null;
    }

    const raw = require('node:fs').readFileSync(supabasePath, 'utf8');
    const data = JSON.parse(raw);

    if (data.user_info) {
      const userInfo = typeof data.user_info === 'string' ? JSON.parse(data.user_info) : data.user_info;

      const cache = loadCache();
      const people = cache.people || {};
      const profile = Object.values(people).find((p: Record<string, unknown>) => p?.email === userInfo.email) as
        | Record<string, unknown>
        | undefined;

      return {
        id: userInfo.id,
        name: (profile?.name as string) || userInfo.user_metadata?.name || 'Unknown',
        email: userInfo.email,
        company: (profile?.company_name as string) || userInfo.user_metadata?.hd,
        title: profile?.job_title as string,
        avatar: (profile?.avatar as string) || userInfo.user_metadata?.picture,
        plan: profile?.subscription_name as string,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get workspaces from cache
 */
export function getWorkspacesFromCache(): Array<{
  id: string;
  name: string;
  slug: string;
  role: string;
  plan: string;
}> {
  try {
    const cache = loadCache();
    const workspaceData = (cache as Record<string, unknown>).workspaceData as Record<string, unknown>;
    const workspaces = (workspaceData?.workspaces as Array<Record<string, unknown>>) || [];

    return workspaces.map((entry) => {
      const ws = (entry.workspace as Record<string, unknown>) || {};
      return {
        id: (ws.workspace_id as string) || '',
        name: (ws.display_name as string) || '(unnamed)',
        slug: (ws.slug as string) || '',
        role: (entry.role as string) || 'member',
        plan: (entry.plan_type as string) || 'free',
      };
    });
  } catch {
    return [];
  }
}

/**
 * Get cache statistics
 */
export function getCacheStats(): {
  path: string;
  exists: boolean;
  size: number;
  totalMeetings: number;
  withNotes: number;
  withTranscripts: number;
} {
  const cachePath = getCachePath();
  const exists = existsSync(cachePath);

  if (!exists) {
    return {
      path: cachePath,
      exists: false,
      size: 0,
      totalMeetings: 0,
      withNotes: 0,
      withTranscripts: 0,
    };
  }

  const stats = statSync(cachePath);
  const state = loadCache();
  const meetings = getMeetings(state);
  const transcripts = getTranscripts(state);

  return {
    path: cachePath,
    exists: true,
    size: stats.size,
    totalMeetings: meetings.length,
    withNotes: meetings.filter((m) => m.notes_markdown || m.notes_plain).length,
    withTranscripts: Object.keys(transcripts).length,
  };
}

/**
 * Format a date for display
 */
export function formatDate(dateStr?: string): string {
  if (!dateStr) {
    return 'unknown date';
  }
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Format a date with time and timezone for display
 */
export function formatDateTime(dateStr?: string): string {
  if (!dateStr) {
    return 'unknown date';
  }
  const d = new Date(dateStr);
  const datePart = d.toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const timePart = d.toLocaleTimeString('en-AU', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  });
  return `${datePart} at ${timePart}`;
}

/**
 * Get ISO date string from document
 */
export function getDocumentDate(doc: Document): string {
  const dateStr = doc.google_calendar_event?.start?.dateTime || doc.created_at;
  if (!dateStr) {
    return 'unknown';
  }
  return new Date(dateStr).toISOString().split('T')[0];
}
