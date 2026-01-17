/**
 * Attendee extraction utilities
 * Handles nested people structures including groups
 */

export interface ExtractedAttendee {
  name: string;
  email?: string;
}

/**
 * Extract all attendees from a document's people field
 * Expands groups to get individual members
 * Deduplicates by email
 */
export function extractAttendees(people: unknown): ExtractedAttendee[] {
  if (!people || typeof people !== 'object') {
    return [];
  }

  const peopleObj = people as Record<string, unknown>;
  const seen = new Set<string>();
  const attendees: ExtractedAttendee[] = [];

  const addPerson = (name: string | undefined, email: string | undefined) => {
    if (!name && !email) {
      return;
    }
    const key = email?.toLowerCase() || name?.toLowerCase() || '';
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    attendees.push({ name: name || '(unknown)', email });
  };

  const extractFromEntry = (entry: Record<string, unknown>) => {
    const name = entry.name as string | undefined;
    const email = entry.email as string | undefined;
    const details = entry.details as Record<string, unknown> | undefined;

    // Check if this is a group with members
    const group = details?.group as Record<string, unknown> | undefined;
    if (group?.members && Array.isArray(group.members)) {
      // It's a group - extract all members
      for (const member of group.members) {
        if (member && typeof member === 'object') {
          const m = member as Record<string, unknown>;
          const memberName =
            (m.name as string | undefined) ||
            ((m.details as Record<string, unknown>)?.person?.name?.fullName as string | undefined);
          const memberEmail = m.email as string | undefined;
          addPerson(memberName, memberEmail);
        }
      }
    } else {
      // It's an individual
      const fullName = name || ((details?.person as Record<string, unknown>)?.name?.fullName as string | undefined);
      addPerson(fullName, email);
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
 * Format attendees as a string for display
 */
export function formatAttendees(attendees: ExtractedAttendee[], includeEmail = false): string {
  return attendees.map((a) => (includeEmail && a.email ? `${a.name} <${a.email}>` : a.name)).join(', ');
}

/**
 * Format attendees as a multi-line list
 */
export function formatAttendeesMultiline(attendees: ExtractedAttendee[]): string {
  return attendees.map((a) => (a.email ? `  ${a.name} <${a.email}>` : `  ${a.name}`)).join('\n');
}
