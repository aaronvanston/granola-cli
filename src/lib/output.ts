/**
 * Output formatting utilities
 */

import type { Document, Person, TranscriptSegment } from '../types.js';
import { extractAttendees, extractParticipants, formatAttendees, formatAttendeesMultiline } from './attendees.js';
import { formatDate, formatDateTime, getDocumentDate, getPeopleArray } from './cache.js';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

export interface OutputOptions {
  json?: boolean;
  jsonFull?: boolean;
  plain?: boolean;
  noEmoji?: boolean;
  noColor?: boolean;
}

let globalOpts: OutputOptions = {};

export function setOutputOptions(opts: OutputOptions): void {
  globalOpts = opts;
}

function c(color: keyof typeof colors, text: string): string {
  if (globalOpts.noColor || globalOpts.plain || process.env.NO_COLOR) {
    return text;
  }
  return `${colors[color]}${text}${colors.reset}`;
}

function emoji(e: string): string {
  if (globalOpts.noEmoji || globalOpts.plain) {
    return '';
  }
  return `${e} `;
}

/**
 * Format a single meeting for list display
 */
export function formatMeetingListItem(doc: Document): string {
  const date = formatDate(doc.google_calendar_event?.start?.dateTime || doc.created_at);
  const hasNotes = doc.notes_markdown || doc.notes_plain;
  const icon = hasNotes ? emoji('📝') : '   ';
  const title = doc.title || '(untitled)';

  return `${icon}${c('dim', date.padEnd(20))} ${title}\n   ${c('gray', `ID: ${doc.id}`)}`;
}

/**
 * Format meeting details
 */
export interface MeetingDetailOptions {
  attendees?: boolean; // Show attendees (default: true)
  expandGroups?: boolean; // Show group member directory (default: false)
}

export function formatMeetingDetail(doc: Document, options: MeetingDetailOptions = {}): string {
  const { attendees: showAttendees = true, expandGroups = false } = options;
  const date = formatDateTime(doc.google_calendar_event?.start?.dateTime || doc.created_at);
  const { organizer, attendees: extractedAttendees, expandedGroups } = extractParticipants(doc, { expandGroups });
  const attendeesStr = formatAttendees(extractedAttendees, true);

  let output = `\n${c('bold', `# ${doc.title || '(untitled)'}`)}\n`;
  output += `${c('dim', 'Date:')} ${date}\n`;
  if (organizer) {
    const orgStr = organizer.email ? `${organizer.name} <${organizer.email}>` : organizer.name;
    output += `${c('dim', 'Organizer:')} ${orgStr}\n`;
  }
  if (showAttendees && attendeesStr) {
    output += `${c('dim', 'Attendees:')} ${attendeesStr}\n`;
  }

  if (showAttendees && expandGroups && expandedGroups && expandedGroups.length > 0) {
    output += `\n${c('cyan', '## Group Members (directory, may not have attended)')}\n`;
    for (const { group, members } of expandedGroups) {
      const groupLine = formatAttendees([group], true);
      output += `${groupLine}\n`;
      if (members.length > 0) {
        output += `${formatAttendeesMultiline(members, true)}\n`;
      } else {
        output += '  - (no members found)\n';
      }
      output += '\n';
    }
  }

  output += `${c('dim', 'ID:')} ${doc.id}\n`;

  if (doc.summary) {
    output += `\n${c('cyan', '## Summary')}\n${doc.summary}\n`;
  }

  if (doc.notes_markdown) {
    output += `\n${c('cyan', '## Notes')}\n${doc.notes_markdown}\n`;
  } else if (doc.notes_plain) {
    output += `\n${c('cyan', '## Notes')}\n${doc.notes_plain}\n`;
  } else {
    output += `\n${c('dim', '*No notes recorded*')}\n`;
  }

  return output;
}

export interface TranscriptOptions {
  diarize?: boolean; // Show You/Them labels (default: true)
  timestamps?: boolean; // Show timestamps (default: true)
  attendees?: boolean; // Show attendees at start (default: true)
  expandGroups?: boolean; // Show group member directory (default: false)
  raw?: boolean; // Just text, no formatting
}

/**
 * Format transcript output
 */
export function formatTranscript(
  doc: Document,
  segments: TranscriptSegment[],
  options: TranscriptOptions = {},
): string {
  const {
    diarize = true,
    timestamps = true,
    attendees: showAttendees = true,
    expandGroups = false,
    raw = false,
  } = options;
  const date = formatDateTime(doc.google_calendar_event?.start?.dateTime || doc.created_at);
  const { organizer, attendees: extractedAttendees, expandedGroups } = extractParticipants(doc, { expandGroups });
  const attendeesStr = formatAttendees(extractedAttendees, true);

  // Raw mode: just the text
  if (raw) {
    return segments.map((seg) => seg.text).join('\n\n');
  }

  let output = `\n${c('bold', `# ${doc.title || '(untitled)'}`)} — Transcript\n`;
  output += `${c('dim', 'Date:')} ${date}\n`;
  if (showAttendees && organizer) {
    const orgStr = organizer.email ? `${organizer.name} <${organizer.email}>` : organizer.name;
    output += `${c('dim', 'Organizer:')} ${orgStr}\n`;
  }
  if (showAttendees && attendeesStr) {
    output += `${c('dim', 'Attendees:')} ${attendeesStr}\n`;
  }

  if (showAttendees && expandGroups && expandedGroups && expandedGroups.length > 0) {
    output += `\n${c('cyan', '## Group Members (directory, may not have attended)')}\n`;
    for (const { group, members } of expandedGroups) {
      const groupLine = formatAttendees([group], true);
      output += `${groupLine}\n`;
      if (members.length > 0) {
        output += `${formatAttendeesMultiline(members, true)}\n`;
      } else {
        output += '  - (no members found)\n';
      }
      output += '\n';
    }
  }

  output += `${c('dim', 'Segments:')} ${segments.length}\n\n`;

  for (const seg of segments) {
    const parts: string[] = [];

    // Speaker label (You = microphone, Them = system/other)
    if (diarize) {
      const isYou = seg.source === 'microphone';
      const speaker = isYou ? 'You' : 'Them';
      const speakerColor = isYou ? 'green' : 'cyan';
      parts.push(c(speakerColor as keyof typeof colors, speaker));
    }

    // Timestamp from ISO string
    const segWithTimestamp = seg as TranscriptSegment & { start_timestamp?: string };
    if (timestamps && segWithTimestamp.start_timestamp) {
      const time = formatTimestamp(segWithTimestamp.start_timestamp);
      parts.push(c('dim', `[${time}]`));
    }

    // Header line (speaker + timestamp)
    if (parts.length > 0) {
      output += `${parts.join(' ')}\n`;
    }

    output += `${seg.text}\n\n`;
  }

  return output;
}

/**
 * Format ISO timestamp to HH:MM:SS
 */
function formatTimestamp(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString('en-AU', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return '';
  }
}

/**
 * Format time in seconds to MM:SS
 */
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Export document to markdown
 */
export function exportToMarkdown(doc: Document): string {
  const date = formatDate(doc.google_calendar_event?.start?.dateTime || doc.created_at);
  const isoDate = getDocumentDate(doc);
  const extractedAttendees = extractAttendees(doc.people);
  const attendeeNames = extractedAttendees.map((a) => a.name);

  let md = `---
title: "${doc.title || 'Untitled Meeting'}"
date: ${isoDate}
type: meeting-notes
source: granola
granola_id: ${doc.id}
attendees: [${attendeeNames.map((a) => `"${a}"`).join(', ')}]
---

# ${doc.title || 'Untitled Meeting'}

**Date:** ${date}
${extractedAttendees.length ? `**Attendees:** ${formatAttendees(extractedAttendees, true)}` : ''}

`;

  if (doc.summary) {
    md += `## Summary\n\n${doc.summary}\n\n`;
  }

  if (doc.notes_markdown) {
    md += `## Notes\n\n${doc.notes_markdown}\n`;
  } else if (doc.notes_plain) {
    md += `## Notes\n\n${doc.notes_plain}\n`;
  }

  return md;
}

/**
 * Convert document to JSON-friendly format
 */
export function documentToJson(doc: Document): Record<string, unknown> {
  const extractedAttendees = extractAttendees(doc.people);

  return {
    id: doc.id,
    title: doc.title,
    date: doc.google_calendar_event?.start?.dateTime || doc.created_at,
    attendees: extractedAttendees,
    hasNotes: !!(doc.notes_markdown || doc.notes_plain),
    hasSummary: !!doc.summary,
    notes: doc.notes_markdown || doc.notes_plain || null,
    summary: doc.summary || null,
  };
}

/**
 * Print list header
 */
export function printListHeader(title: string, count: number): void {
  console.log(`\n${emoji('📅')}${c('bold', title)} (${count})\n`);
}

/**
 * Print search header
 */
export function printSearchHeader(query: string, count: number): void {
  console.log(`\n${emoji('🔍')}${c('bold', 'Search:')} "${query}" (${count} results)\n`);
}

/**
 * Print stats
 */
export function printStats(stats: {
  path: string;
  exists: boolean;
  size: number;
  totalMeetings: number;
  withNotes: number;
  withTranscripts: number;
}): void {
  console.log(`\n${emoji('📊')}${c('bold', 'Granola Stats')}\n`);
  console.log(`Total meetings:    ${stats.totalMeetings}`);
  console.log(`With notes:        ${stats.withNotes}`);
  console.log(`With transcripts:  ${stats.withTranscripts}`);
  console.log(`Cache location:    ${stats.path}`);
  console.log(`Cache size:        ${(stats.size / 1024 / 1024).toFixed(1)} MB\n`);
}
