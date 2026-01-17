/**
 * Attendee extraction utilities.
 *
 * Granola provides invitees in a nested `people` object. Invitees can include
 * both individuals and email groups (e.g. engineering@...). Groups can include
 * a member directory, but expanding members is NOT the same as actual attendance.
 */

import type { Document } from '../types.js';

export interface ExtractedAttendee {
  name: string;
  email?: string;
  isGroup?: boolean;
  memberCount?: number;
}

export interface MeetingParticipants {
  organizer?: ExtractedAttendee;
  attendees: ExtractedAttendee[];
  expandedGroups?: Array<{ group: ExtractedAttendee; members: ExtractedAttendee[] }>;
}

export interface ExtractParticipantsOptions {
  expandGroups?: boolean; // Opt-in: show group member directory
}

function lower(s?: string): string {
  return (s || '').toLowerCase();
}

function dedupeKey(att: { name?: string; email?: string }): string {
  return lower(att.email) || lower(att.name);
}

function extractFullName(details?: Record<string, unknown>): string | undefined {
  const person = details?.person as Record<string, unknown> | undefined;
  const nameObj = person?.name as Record<string, unknown> | undefined;
  return (nameObj?.fullName as string | undefined) || undefined;
}

/**
 * Extract attendees from a document's people field.
 * Does NOT expand groups by default.
 */
export function extractAttendees(people: unknown): ExtractedAttendee[] {
  if (!people || typeof people !== 'object') {
    return [];
  }

  const peopleObj = people as Record<string, unknown>;
  const seen = new Set<string>();
  const attendees: ExtractedAttendee[] = [];

  const addAttendee = (a: ExtractedAttendee) => {
    const key = dedupeKey(a);
    if (!key || seen.has(key)) {
      return;
    }
    seen.add(key);
    attendees.push(a);
  };

  const extractFromEntry = (entry: Record<string, unknown>) => {
    const name = entry.name as string | undefined;
    const email = entry.email as string | undefined;
    const details = entry.details as Record<string, unknown> | undefined;

    const group = details?.group as Record<string, unknown> | undefined;
    if (group?.members && Array.isArray(group.members)) {
      // Group invitee: show group with directory size
      addAttendee({
        name: name || email || '(group)',
        email,
        isGroup: true,
        memberCount: group.members.length,
      });
      return;
    }

    // Individual invitee
    const fullName = name || extractFullName(details) || (email ? email.split('@')[0] : undefined);
    addAttendee({ name: fullName || '(unknown)', email, isGroup: false });
  };

  // creator
  const creator = peopleObj.creator as Record<string, unknown> | undefined;
  if (creator) {
    extractFromEntry(creator);
  }

  // attendees
  const attendeesArr = peopleObj.attendees as Array<Record<string, unknown>> | undefined;
  if (attendeesArr && Array.isArray(attendeesArr)) {
    for (const entry of attendeesArr) {
      if (entry && typeof entry === 'object') {
        extractFromEntry(entry);
      }
    }
  }

  return attendees;
}

function extractGroupMembers(entry: Record<string, unknown>): ExtractedAttendee[] {
  const details = entry.details as Record<string, unknown> | undefined;
  const group = details?.group as Record<string, unknown> | undefined;
  const members = group?.members;
  if (!members || !Array.isArray(members)) {
    return [];
  }

  const out: ExtractedAttendee[] = [];
  const seen = new Set<string>();

  for (const member of members) {
    if (!member || typeof member !== 'object') {
      continue;
    }

    const m = member as Record<string, unknown>;
    const mEmail = m.email as string | undefined;
    const mName = (m.name as string | undefined) || extractFullName(m.details as Record<string, unknown> | undefined);

    const key = lower(mEmail) || lower(mName);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);

    out.push({ name: mName || '(unknown)', email: mEmail, isGroup: false });
  }

  return out;
}

/**
 * Extract participants from a document including organizer.
 *
 * Organizer comes from `google_calendar_event.organizer`.
 *
 * If `expandGroups` is enabled, also includes an expanded directory listing
 * for group invitees.
 */
export function extractParticipants(doc: Document, options: ExtractParticipantsOptions = {}): MeetingParticipants {
  const attendees = extractAttendees(doc.people);

  // Organizer
  let organizer: ExtractedAttendee | undefined;
  const organizerEmail = doc.google_calendar_event?.organizer?.email;

  if (organizerEmail) {
    const orgInAttendees = attendees.find((a) => lower(a.email) === lower(organizerEmail));
    organizer = {
      name: orgInAttendees?.name || organizerEmail.split('@')[0],
      email: organizerEmail,
      isGroup: false,
    };
  }

  const filteredAttendees = organizer?.email
    ? attendees.filter((a) => lower(a.email) !== lower(organizer.email))
    : attendees;

  let expandedGroups: MeetingParticipants['expandedGroups'];
  if (options.expandGroups) {
    expandedGroups = [];
    const peopleObj = doc.people as Record<string, unknown> | undefined;
    const attendeesArr = peopleObj?.attendees as Array<Record<string, unknown>> | undefined;

    if (attendeesArr && Array.isArray(attendeesArr)) {
      for (const entry of attendeesArr) {
        if (!entry || typeof entry !== 'object') {
          continue;
        }

        const details = (entry as Record<string, unknown>).details as Record<string, unknown> | undefined;
        const group = details?.group as Record<string, unknown> | undefined;
        if (!group?.members || !Array.isArray(group.members)) {
          continue;
        }

        const name = (entry as Record<string, unknown>).name as string | undefined;
        const email = (entry as Record<string, unknown>).email as string | undefined;
        const groupAtt: ExtractedAttendee = {
          name: name || email || '(group)',
          email,
          isGroup: true,
          memberCount: group.members.length,
        };

        const members = extractGroupMembers(entry as Record<string, unknown>);
        expandedGroups.push({ group: groupAtt, members });
      }
    }
  }

  return { organizer, attendees: filteredAttendees, expandedGroups };
}

/**
 * Format attendees as a string for display.
 * Groups shown as "Engineering <engineering@...> (12 people)".
 */
export function formatAttendees(attendees: ExtractedAttendee[], includeEmail = false): string {
  return attendees
    .map((a) => {
      const hasEmail = !!a.email;
      const groupSuffix = a.isGroup && a.memberCount ? ` (${a.memberCount} people)` : '';

      if (includeEmail && hasEmail) {
        return `${a.name} <${a.email}>${groupSuffix}`;
      }

      return `${a.name}${groupSuffix}`;
    })
    .join(', ');
}

export function formatAttendeesMultiline(attendees: ExtractedAttendee[], includeEmail = false): string {
  return attendees
    .map((a) => {
      const groupSuffix = a.isGroup && a.memberCount ? ` (${a.memberCount} people)` : '';

      if (includeEmail && a.email) {
        return `  - ${a.name} <${a.email}>${groupSuffix}`;
      }

      return `  - ${a.name}${groupSuffix}`;
    })
    .join('\n');
}
