/**
 * Attendee extraction utilities
 * Shows actual attendees as they appear in Granola (not expanded)
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
}

/**
 * Extract attendees from a document's people field
 * Does NOT expand groups - shows them as groups with member count
 */
export function extractAttendees(people: unknown): ExtractedAttendee[] {
  if (!people || typeof people !== 'object') {
    return [];
  }

  const peopleObj = people as Record<string, unknown>;
  const seen = new Set<string>();
  const attendees: ExtractedAttendee[] = [];

  const addAttendee = (name: string | undefined, email: string | undefined, isGroup = false, memberCount?: number) => {
    if (!name && !email) {
      return;
    }
    const key = email?.toLowerCase() || name?.toLowerCase() || '';
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    attendees.push({
      name: name || '(unknown)',
      email,
      isGroup,
      memberCount,
    });
  };

  const extractFromEntry = (entry: Record<string, unknown>) => {
    const name = entry.name as string | undefined;
    const email = entry.email as string | undefined;
    const details = entry.details as Record<string, unknown> | undefined;

    // Check if this is a group
    const group = details?.group as Record<string, unknown> | undefined;
    if (group?.members && Array.isArray(group.members)) {
      // It's a group - add as group with member count
      const memberCount = group.members.length;
      addAttendee(name, email, true, memberCount);
    } else {
      // It's an individual
      const fullName =
        name ||
        (((details?.person as Record<string, unknown>)?.name as Record<string, unknown>)?.fullName as
          | string
          | undefined);
      addAttendee(fullName, email, false);
    }
  };

  // Extract creator
  const creator = peopleObj.creator as Record<string, unknown> | undefined;
  if (creator) {
    extractFromEntry(creator);
  }

  // Extract attendees array
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

/**
 * Extract participants from a document including organizer
 */
export function extractParticipants(doc: Document): MeetingParticipants {
  const attendees = extractAttendees(doc.people);

  // Get organizer from google_calendar_event
  let organizer: ExtractedAttendee | undefined;
  const calEvent = doc.google_calendar_event as Record<string, unknown> | undefined;
  const organizerData = calEvent?.organizer as Record<string, unknown> | undefined;

  if (organizerData?.email) {
    const orgEmail = organizerData.email as string;
    const orgName = organizerData.displayName as string | undefined;

    // Find organizer in attendees list for full name
    const orgInAttendees = attendees.find((a) => a.email?.toLowerCase() === orgEmail.toLowerCase());

    organizer = {
      name: orgInAttendees?.name || orgName || orgEmail.split('@')[0],
      email: orgEmail,
    };

    // Remove organizer from attendees list (will show separately)
    const filteredAttendees = attendees.filter((a) => a.email?.toLowerCase() !== orgEmail.toLowerCase());

    return { organizer, attendees: filteredAttendees };
  }

  return { attendees };
}

/**
 * Format attendees as a string for display
 * Groups shown as "Engineering (12 people)"
 */
export function formatAttendees(attendees: ExtractedAttendee[], includeEmail = false): string {
  return attendees
    .map((a) => {
      let display = a.name;
      if (a.isGroup && a.memberCount) {
        display += ` (${a.memberCount} people)`;
      }
      if (includeEmail && a.email && !a.isGroup) {
        display = `${a.name} <${a.email}>`;
      } else if (includeEmail && a.email && a.isGroup) {
        display = `${a.name} <${a.email}> (${a.memberCount} people)`;
      }
      return display;
    })
    .join(', ');
}
