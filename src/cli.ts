#!/usr/bin/env node
/**
 * Granola CLI — Fast access to your meeting notes
 */

import { writeFileSync } from 'node:fs';
import { GranolaClient } from './client.js';
import {
  findDocument,
  getCacheStats,
  getCompanies,
  getCurrentUser,
  getDocumentTranscript,
  getDocumentsByFolder,
  getDocumentsByPerson,
  getFolders,
  getMeetings,
  getPeople,
  getSharedDocuments,
  getWorkspacesFromCache,
  loadCache,
  searchDocuments,
} from './lib/cache.js';
import {
  documentToJson,
  exportToMarkdown,
  formatMeetingDetail,
  formatMeetingListItem,
  formatTranscript,
  printListHeader,
  printSearchHeader,
  printStats,
  setOutputOptions,
} from './lib/output.js';
import { extractGranolaToken, hasToken } from './lib/token.js';
import type { Document } from './types.js';

const VERSION = '0.1.0';

interface GlobalOptions {
  json?: boolean;
  jsonFull?: boolean;
  plain?: boolean;
  noEmoji?: boolean;
  noColor?: boolean;
}

function parseArgs(args: string[]): {
  command: string;
  positional: string[];
  options: Record<string, string | boolean | number>;
} {
  const options: Record<string, string | boolean | number> = {};
  const positional: string[] = [];
  let command = '';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (!command && !arg.startsWith('-')) {
      command = arg;
      continue;
    }

    if (arg.startsWith('--')) {
      const [key, val] = arg.slice(2).split('=');
      if (val !== undefined) {
        options[key] = val;
      } else if (args[i + 1] && !args[i + 1].startsWith('-')) {
        options[key] = args[++i];
      } else {
        options[key] = true;
      }
    } else if (arg.startsWith('-') && arg.length === 2) {
      const key = arg.slice(1);
      if (args[i + 1] && !args[i + 1].startsWith('-')) {
        options[key] = args[++i];
      } else {
        options[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }

  return { command, positional, options };
}

function getGlobalOptions(options: Record<string, string | boolean | number>): GlobalOptions {
  return {
    json: !!options.json,
    jsonFull: !!options['json-full'],
    plain: !!options.plain,
    noEmoji: !!options['no-emoji'],
    noColor: !!options['no-color'],
  };
}

// Commands

function cmdList(positional: string[], options: Record<string, string | boolean | number>): void {
  const limit = Number.parseInt(String(positional[0] || options.n || '20'), 10);
  const globalOpts = getGlobalOptions(options);
  setOutputOptions(globalOpts);

  const meetings = getMeetings()
    .sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime())
    .slice(0, limit);

  if (globalOpts.json) {
    console.log(JSON.stringify(meetings.map(documentToJson), null, 2));
    return;
  }

  printListHeader('Recent Meetings', meetings.length);
  for (const m of meetings) {
    console.log(`${formatMeetingListItem(m)}\n`);
  }
}

function cmdSearch(positional: string[], options: Record<string, string | boolean | number>): void {
  const query = positional.join(' ');
  if (!query) {
    console.error('Usage: granola search <query>');
    process.exit(1);
  }

  const limit = Number.parseInt(String(options.n || '20'), 10);
  const globalOpts = getGlobalOptions(options);
  setOutputOptions(globalOpts);

  const results = searchDocuments(query).slice(0, limit);

  if (globalOpts.json) {
    console.log(JSON.stringify(results.map(documentToJson), null, 2));
    return;
  }

  printSearchHeader(query, results.length);
  for (const m of results) {
    console.log(`${formatMeetingListItem(m)}\n`);
  }
}

function cmdShow(positional: string[], options: Record<string, string | boolean | number>): void {
  const query = positional.join(' ');
  if (!query) {
    console.error('Usage: granola show <id or title>');
    process.exit(1);
  }

  const globalOpts = getGlobalOptions(options);
  setOutputOptions(globalOpts);

  const doc = findDocument(query);
  if (!doc) {
    console.error(`No meeting found for: ${query}`);
    process.exit(1);
  }

  if (globalOpts.json) {
    console.log(JSON.stringify(documentToJson(doc), null, 2));
    return;
  }

  const detailOpts = {
    attendees: !options['no-attendees'],
    expandGroups: !!options['expand-groups'],
  };

  console.log(formatMeetingDetail(doc, detailOpts));
}

async function cmdTranscript(positional: string[], options: Record<string, string | boolean | number>): Promise<void> {
  const query = positional.join(' ');
  if (!query) {
    console.error('Usage: granola transcript <id or title>');
    process.exit(1);
  }

  const globalOpts = getGlobalOptions(options);
  setOutputOptions(globalOpts);

  // Transcript-specific options
  const transcriptOpts = {
    diarize: !options['no-diarize'],
    timestamps: !options['no-timestamps'],
    attendees: !options['no-attendees'],
    expandGroups: !!options['expand-groups'],
    raw: !!options.raw,
  };

  const state = loadCache();
  const doc = findDocument(query, state);
  if (!doc) {
    console.error(`No meeting found for: ${query}`);
    process.exit(1);
  }

  // Transcripts are not cached locally - always fetch from API
  try {
    const token = await extractGranolaToken();
    const client = new GranolaClient(token);

    if (!globalOpts.json && !globalOpts.plain && !transcriptOpts.raw) {
      console.log(`\x1b[33m⚡ Fetching transcript for: ${doc.title}...\x1b[0m`);
    }

    const segments = await client.getDocumentTranscript(doc.id);

    if (!segments || segments.length === 0) {
      console.error(`No transcript available for: ${doc.title}`);
      console.error('This meeting may not have been recorded or transcribed.');
      process.exit(1);
    }

    if (globalOpts.json) {
      console.log(JSON.stringify({ id: doc.id, title: doc.title, segments }, null, 2));
      return;
    }

    console.log(formatTranscript(doc, segments, transcriptOpts));
  } catch (err) {
    console.error(`Error fetching transcript: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

function cmdExport(positional: string[], options: Record<string, string | boolean | number>): void {
  const query = positional[0];
  const outPath = positional[1] as string | undefined;

  if (!query) {
    console.error('Usage: granola export <id or title> [output.md]');
    process.exit(1);
  }

  const doc = findDocument(query);
  if (!doc) {
    console.error(`No meeting found for: ${query}`);
    process.exit(1);
  }

  const md = exportToMarkdown(doc);
  const dateStr = doc.google_calendar_event?.start?.dateTime || doc.created_at;
  const isoDate = dateStr ? new Date(dateStr).toISOString().split('T')[0] : 'unknown';
  const slug = (doc.title || 'meeting').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
  const finalPath = outPath || `${isoDate}-${slug}.md`;

  writeFileSync(finalPath, md);
  console.log(`✅ Exported to: ${finalPath}`);
}

function cmdStats(options: Record<string, string | boolean | number>): void {
  const globalOpts = getGlobalOptions(options);
  setOutputOptions(globalOpts);

  const stats = getCacheStats();

  if (globalOpts.json) {
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  printStats(stats);
}

function cmdPeople(options: Record<string, string | boolean | number>): void {
  const globalOpts = getGlobalOptions(options);
  setOutputOptions(globalOpts);

  const people = getPeople();

  if (globalOpts.json) {
    console.log(
      JSON.stringify(
        people.map((p) => ({
          name: p.name,
          email: p.email,
          company: (p as Record<string, unknown>).company_name || null,
          title: (p as Record<string, unknown>).job_title || null,
        })),
        null,
        2,
      ),
    );
    return;
  }

  console.log(`\n👥 People (${people.length})\n`);
  const sortedPeople = people.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  for (const p of sortedPeople) {
    const company = (p as Record<string, unknown>).company_name;
    const extra = company ? ` (${company})` : '';
    console.log(`  ${p.name || '(unnamed)'}${extra}`);
    if (p.email) {
      console.log(`    ${p.email}`);
    }
  }
  console.log('');
}

function cmdCompanies(options: Record<string, string | boolean | number>): void {
  const globalOpts = getGlobalOptions(options);
  setOutputOptions(globalOpts);

  const companies = getCompanies();

  if (globalOpts.json) {
    console.log(JSON.stringify(companies, null, 2));
    return;
  }

  console.log(`\n🏢 Companies (${companies.length})\n`);
  for (const c of companies) {
    console.log(`  ${c}`);
  }
  console.log('');
}

function cmdFolders(options: Record<string, string | boolean | number>): void {
  const globalOpts = getGlobalOptions(options);
  setOutputOptions(globalOpts);

  const folders = getFolders();

  if (globalOpts.json) {
    console.log(JSON.stringify(folders, null, 2));
    return;
  }

  console.log(`\n📁 Folders (${folders.length})\n`);
  for (const f of folders) {
    const shared = f.isShared ? ' 🔗' : '';
    console.log(`  ${f.title}${shared} (${f.noteCount} notes)`);
    console.log(`    ID: ${f.id}`);
  }
  console.log('');
}

function cmdFolder(positional: string[], options: Record<string, string | boolean | number>): void {
  const query = positional.join(' ');
  if (!query) {
    console.error('Usage: granola folder <name or id>');
    process.exit(1);
  }

  const globalOpts = getGlobalOptions(options);
  setOutputOptions(globalOpts);

  const docs = getDocumentsByFolder(query);

  if (docs.length === 0) {
    console.error(`No folder found matching: ${query}`);
    process.exit(1);
  }

  if (globalOpts.json) {
    console.log(JSON.stringify(docs.map(documentToJson), null, 2));
    return;
  }

  printListHeader(`Folder: ${query}`, docs.length);
  for (const m of docs) {
    console.log(`${formatMeetingListItem(m)}\n`);
  }
}

function cmdPerson(positional: string[], options: Record<string, string | boolean | number>): void {
  const query = positional.join(' ');
  if (!query) {
    console.error('Usage: granola person <name or email>');
    process.exit(1);
  }

  const limit = Number.parseInt(String(options.n || '20'), 10);
  const globalOpts = getGlobalOptions(options);
  setOutputOptions(globalOpts);

  const docs = getDocumentsByPerson(query).slice(0, limit);

  if (globalOpts.json) {
    console.log(JSON.stringify(docs.map(documentToJson), null, 2));
    return;
  }

  printListHeader(`Meetings with: ${query}`, docs.length);
  for (const m of docs) {
    console.log(`${formatMeetingListItem(m)}\n`);
  }
}

function cmdShared(options: Record<string, string | boolean | number>): void {
  const globalOpts = getGlobalOptions(options);
  setOutputOptions(globalOpts);

  const docs = getSharedDocuments();

  if (globalOpts.json) {
    console.log(JSON.stringify(docs.map(documentToJson), null, 2));
    return;
  }

  if (docs.length === 0) {
    console.log('\n📤 No shared documents found\n');
    return;
  }

  printListHeader('Shared Documents', docs.length);
  for (const m of docs) {
    console.log(`${formatMeetingListItem(m)}\n`);
  }
}

async function cmdSync(options: Record<string, string | boolean | number>): Promise<void> {
  const globalOpts = getGlobalOptions(options);

  console.log('\n🔄 Syncing with Granola API...\n');

  try {
    const token = await extractGranolaToken();
    const client = new GranolaClient(token);

    // Refresh calendar events
    console.log('  Refreshing calendar events...');
    await client.refreshGoogleEvents();
    console.log('  ✅ Calendar synced');

    // Fetch recent documents to warm cache
    console.log('  Fetching recent documents...');
    const docs = await client.getDocuments({ limit: 50 });
    console.log(`  ✅ Fetched ${docs.docs?.length || 0} documents`);

    // Note about cache
    console.log('\n📝 Note: The Granola app syncs its local cache automatically.');
    console.log('   This command triggers a refresh of calendar events and');
    console.log('   fetches recent documents via API.\n');

    if (globalOpts.json) {
      console.log(
        JSON.stringify({
          success: true,
          documentsRefreshed: docs.docs?.length || 0,
        }),
      );
    }
  } catch (err) {
    console.error(`\n❌ Sync failed: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

function cmdCheck(): void {
  console.log('\n🔍 Credential Check\n');

  const tokenAvailable = hasToken();
  console.log(`API Token:    ${tokenAvailable ? '✅ Available' : '❌ Not found'}`);

  const stats = getCacheStats();
  console.log(`Local Cache:  ${stats.exists ? '✅ Found' : '❌ Not found'}`);
  if (stats.exists) {
    console.log(`  Meetings:   ${stats.totalMeetings}`);
    console.log(`  With notes: ${stats.withNotes}`);
  }
  console.log('');
}

function cmdWhoami(options: Record<string, string | boolean | number>): void {
  const globalOpts = getGlobalOptions(options);
  setOutputOptions(globalOpts);

  const user = getCurrentUser();
  const workspaces = getWorkspacesFromCache();

  if (globalOpts.json) {
    console.log(JSON.stringify({ user, workspaces }, null, 2));
    return;
  }

  console.log('\n🧑 Logged in to Granola\n');

  if (user) {
    console.log(`Name:      ${user.name}`);
    console.log(`Email:     ${user.email}`);
    if (user.title) {
      console.log(`Title:     ${user.title}`);
    }
    if (user.company) {
      console.log(`Company:   ${user.company}`);
    }
    if (user.plan) {
      console.log(`Plan:      ${user.plan}`);
    }
    console.log('');
  } else {
    console.log('User info not available locally.\n');
  }

  if (workspaces.length > 0) {
    console.log(`Workspaces: ${workspaces.length}`);
    for (const ws of workspaces) {
      const extra = [ws.role, ws.plan].filter(Boolean).join(', ');
      console.log(`  - ${ws.name}${extra ? ` (${extra})` : ''}`);
    }
    console.log('');
  }
}

function cmdWorkspaces(options: Record<string, string | boolean | number>): void {
  const globalOpts = getGlobalOptions(options);
  setOutputOptions(globalOpts);

  const workspaces = getWorkspacesFromCache();

  if (globalOpts.json) {
    console.log(JSON.stringify(workspaces, null, 2));
    return;
  }

  console.log(`\n🏠 Workspaces (${workspaces.length})\n`);
  for (const ws of workspaces) {
    console.log(`  ${ws.name}`);
    console.log(`    Slug: ${ws.slug}`);
    console.log(`    Role: ${ws.role}`);
    console.log(`    Plan: ${ws.plan}`);
    console.log(`    ID:   ${ws.id}`);
    console.log('');
  }
}

function cmdHelp(command?: string): void {
  if (command) {
    const helps: Record<string, string> = {
      list: `
granola list [n] — List recent meetings

Usage:
  granola list [count]
  granola ls [count]

Arguments:
  count          Number of meetings to show (default: 20)

Options:
  -n <count>     Alternative way to specify count
  --json         Output as JSON array
  --plain        Disable emoji and colors

Description:
  Lists your most recent meetings from the local Granola cache.
  Meetings are sorted by last updated time.
  A 📝 emoji indicates meetings that have notes.

Examples:
  granola list              # Show 20 recent meetings
  granola list 10           # Show 10 recent meetings
  granola ls 5              # Short alias
  granola list --json       # Output as JSON for scripting
  granola list -n 50        # Show 50 meetings
`,
      search: `
granola search <query> — Search meetings

Usage:
  granola search <query>
  granola s <query>

Arguments:
  query          Search term (searches title, notes, and attendees)

Options:
  -n <count>     Max results to return (default: 20)
  --json         Output as JSON array

Description:
  Searches your meetings by title, notes content, or attendee name.
  Results are sorted by most recently updated.
  Search is case-insensitive.

Examples:
  granola search "standup"           # Find standup meetings
  granola search "product review"    # Multi-word search
  granola search "Alice"             # Find meetings with Alice
  granola s "1:1" --json             # Short alias, JSON output
  granola search "retro" -n 5        # Limit to 5 results
`,
      show: `
granola show <id|title> — Show meeting details

Usage:
  granola show <identifier>
  granola get <identifier>

Arguments:
  identifier     Meeting ID (UUID) or title to search for

Options:
  --json            Output as JSON object
  --no-attendees    Hide attendees
  --expand-groups   Show group member directory (may not have attended)

Description:
  Shows full details of a meeting including:
  - Title, date, and attendees
  - AI-generated summary (if available)
  - Your notes

  You can use a partial title — it will find the most recent match.

Examples:
  granola show "health check"                    # Find by partial title
  granola show "Aaron x April"                   # More specific search
  granola show abc123-def456-789                 # Exact ID
  granola show "standup" --json                  # JSON output
  granola get "retro"                            # Alias
`,
      transcript: `
granola transcript <id|title> — Show meeting transcript

Usage:
  granola transcript <identifier>
  granola t <identifier>

Arguments:
  identifier     Meeting ID (UUID) or title to search for

Options:
  --json           Output as JSON with segments array
  --no-attendees   Hide attendees list at start
  --expand-groups  Show group member directory (may not have attended)
  --no-diarize     Hide You/Them speaker labels
  --no-timestamps  Hide timestamps
  --raw            Just output the text (no formatting)

Description:
  Fetches and shows the full transcript of a meeting.
  
  Speaker diarization:
    "You"  = microphone (your voice)
    "Them" = system audio (other participants)
  
  ⚠️  This command makes an API call to Granola servers.
  Transcripts are not cached locally.

Examples:
  granola transcript "standup"              # Full transcript with speakers
  granola t "1:1" --no-timestamps           # Without timestamps
  granola t "meeting" --no-diarize          # Without You/Them labels
  granola t "meeting" --raw                 # Just the text
  granola transcript "meeting" --json       # JSON output
`,
      export: `
granola export <id|title> [path] — Export to markdown

Usage:
  granola export <identifier> [output-path]

Arguments:
  identifier     Meeting ID (UUID) or title to search for
  output-path    Output file path (optional)

Description:
  Exports a meeting to a markdown file with YAML frontmatter.
  
  If no output path is specified, creates a file named:
  YYYY-MM-DD-meeting-title-slug.md

  The frontmatter includes:
  - title, date, type, source
  - granola_id for reference
  - attendees list

Examples:
  granola export "health check"
  # Creates: 2026-01-16-aaron-april-quarterly-health-check.md

  granola export "standup" ./notes/standup.md
  # Creates: ./notes/standup.md

  granola export "retro" ~/Desktop/retro.md
`,
      stats: `
granola stats — Show cache statistics

Usage:
  granola stats

Options:
  --json         Output as JSON object

Description:
  Shows statistics about your local Granola cache:
  - Total number of meetings
  - Meetings with notes
  - Meetings with transcripts
  - Cache file location and size

Examples:
  granola stats
  granola stats --json
`,
      sync: `
granola sync — Sync with Granola API

Usage:
  granola sync

Description:
  Triggers a refresh of data from Granola servers:
  - Refreshes Google Calendar events
  - Fetches recent documents
  
  ⚠️  This command makes API calls to Granola servers.
  
  Note: The Granola desktop app also syncs automatically
  when running. This command is useful for ensuring
  fresh data before querying.

Examples:
  granola sync
`,
      check: `
granola check — Verify Granola setup

Usage:
  granola check

Description:
  Checks that Granola is properly set up:
  - API token availability (for API commands)
  - Local cache existence and stats

  Use this to troubleshoot if commands aren't working.

Examples:
  granola check
`,
      whoami: `
granola whoami — Show your account info

Usage:
  granola whoami

Options:
  --json         Output as JSON

Description:
  Shows your logged-in Granola account details:
  - Name, email, title, company
  - Subscription plan
  - Workspaces with roles

Examples:
  granola whoami
  granola whoami --json
`,
      workspaces: `
granola workspaces — List your workspaces

Usage:
  granola workspaces
  granola ws

Options:
  --json         Output as JSON array

Description:
  Lists all your Granola workspaces with details:
  - Name and slug
  - Your role (admin, member, etc.)
  - Plan type (business, free, etc.)

Examples:
  granola workspaces
  granola ws --json
`,
      people: `
granola people — List all people from your meetings

Usage:
  granola people

Options:
  --json         Output as JSON array

Description:
  Lists all people who have appeared in your meetings,
  including their name, email, and company.

Examples:
  granola people
  granola people --json
`,
      companies: `
granola companies — List companies from your meetings

Usage:
  granola companies

Options:
  --json         Output as JSON array

Description:
  Lists all unique companies extracted from people in your meetings.

Examples:
  granola companies
  granola companies --json
`,
      folders: `
granola folders — List your note folders

Usage:
  granola folders

Options:
  --json         Output as JSON array

Description:
  Lists all your Granola folders with note counts.
  Shared folders are marked with 🔗.

Examples:
  granola folders
  granola folders --json
`,
      folder: `
granola folder <name|id> — List notes in a folder

Usage:
  granola folder <name or id>

Arguments:
  name or id     Folder name (partial match) or folder ID

Options:
  --json         Output as JSON array

Description:
  Lists all notes in a specific folder.

Examples:
  granola folder "1:1s"
  granola folder "HR"
  granola folder abc123-def456
`,
      person: `
granola person <name|email> — List meetings with a person

Usage:
  granola person <name or email>

Arguments:
  name or email  Person's name or email (partial match)

Options:
  -n <count>     Max results (default: 20)
  --json         Output as JSON array

Description:
  Lists all meetings that include a specific person.
  Searches by name or email address.

Examples:
  granola person "Alice"
  granola person "alice@example.com"
  granola person "Smith" -n 50
`,
      shared: `
granola shared — List shared documents

Usage:
  granola shared

Options:
  --json         Output as JSON array

Description:
  Lists all documents that have been shared with you
  or that you have shared.

Examples:
  granola shared
  granola shared --json
`,
      help: `
granola help [command] — Show help

Usage:
  granola help
  granola help <command>
  granola <command> --help

Description:
  Shows help information. Use 'granola help <command>' for
  detailed help on a specific command.

Examples:
  granola help              # General help
  granola help search       # Help for search command
  granola list --help       # Same as 'granola help list'
`,
    };

    const helpText = helps[command];
    if (helpText) {
      console.log(helpText);
    } else {
      console.error(`Unknown command: ${command}\n`);
      console.log(`Available commands: ${Object.keys(helps).join(', ')}`);
      console.log(`\nRun 'granola help' for general usage.`);
      process.exit(1);
    }
    return;
  }

  console.log(`
🥣 granola v${VERSION} — Fast Granola CLI for meeting notes

Usage:
  granola <command> [options]

Meetings:
  list [n]                    List recent meetings (default: 20)
  search <query>              Search by title, notes, or attendee
  show <id|title>             Show meeting details and notes
  transcript <id|title>       Show meeting transcript
  export <id|title> [path]    Export meeting to markdown file

People & Companies:
  people                      List all people from meetings
  companies                   List companies from meetings
  person <name|email>         List meetings with a specific person

Folders & Sharing:
  folders                     List all folders
  folder <name|id>            List notes in a folder
  shared                      List shared documents

Info:
  stats                       Show cache statistics
  check                       Show credential and cache status
  whoami                      Show your account details
  workspaces                  List your workspaces
  sync                        Refresh data from API ⚡
  help [command]              Show help for a command

Aliases:
  ls        → list
  s         → search
  get       → show
  t         → transcript

Global Options:
  --json          Output as JSON (for scripting)
  --plain         Stable output (no emoji, no color)
  --no-emoji      Disable emoji only
  --no-color      Disable ANSI colors (or set NO_COLOR=1)
  -h, --help      Show help
  -v, --version   Show version

Examples:
  granola list 10                              # Recent meetings
  granola search "standup"                     # Find meetings
  granola person "Alice"                       # Meetings with Alice
  granola folder "1:1s"                        # Notes in folder
  granola export "retro" ./notes/retro.md      # Export to file

More Help:
  granola help <command>      Detailed help for a command
  https://github.com/aaronvanston/granola-cli

Source: Reads from local Granola cache (~/.../Granola/cache-v3.json)
`);
}

// Main
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { command, positional, options } = parseArgs(args);

  // Version
  if (options.version || options.v) {
    console.log(`granola v${VERSION}`);
    process.exit(0);
  }

  // Help
  if (options.help || options.h || command === 'help') {
    cmdHelp(command === 'help' ? positional[0] : undefined);
    process.exit(0);
  }

  // Commands
  switch (command) {
    case 'list':
    case 'ls':
      cmdList(positional, options);
      break;

    case 'search':
    case 's':
      cmdSearch(positional, options);
      break;

    case 'show':
    case 'get':
      cmdShow(positional, options);
      break;

    case 'transcript':
    case 't':
      await cmdTranscript(positional, options);
      break;

    case 'export':
      cmdExport(positional, options);
      break;

    case 'stats':
      cmdStats(options);
      break;

    case 'people':
      cmdPeople(options);
      break;

    case 'companies':
      cmdCompanies(options);
      break;

    case 'folders':
      cmdFolders(options);
      break;

    case 'folder':
      cmdFolder(positional, options);
      break;

    case 'person':
      cmdPerson(positional, options);
      break;

    case 'shared':
      cmdShared(options);
      break;

    case 'sync':
      await cmdSync(options);
      break;

    case 'check':
      cmdCheck();
      break;

    case 'whoami':
      cmdWhoami(options);
      break;

    case 'workspaces':
    case 'ws':
      cmdWorkspaces(options);
      break;

    case '':
      cmdHelp();
      break;

    default:
      // If it looks like an ID, treat as show
      if (command.includes('-') && command.length > 30) {
        cmdShow([command, ...positional], options);
      } else {
        console.error(`Unknown command: ${command}\n\nRun 'granola help' for usage.`);
        process.exit(1);
      }
  }
}

main().catch((err) => {
  console.error(`Error: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
