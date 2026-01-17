# granola 🥣

Fast CLI for accessing your [Granola](https://granola.ai) meeting notes, transcripts, and search.

## Disclaimer

This project reads from Granola's **local cache file** and uses **undocumented APIs**. Granola can change these at any time — **expect this to break without notice**.

This project is not affiliated with or endorsed by Granola.

## Installation

```bash
# npm / pnpm / bun
npm install -g granola-cli
pnpm add -g granola-cli
bun add -g granola-cli

# From source
git clone https://github.com/aaronvanston/granola-cli.git
cd granola-cli && bun install && bun link
```

## Prerequisites

- **macOS** (primary support)
- [Granola](https://granola.ai) desktop app installed and logged in

### macOS Assumptions

This CLI expects Granola's data files at these locations:

| File | Path |
|------|------|
| Cache | `~/Library/Application Support/Granola/cache-v3.json` |
| Auth | `~/Library/Application Support/Granola/supabase.json` |

The Granola desktop app creates these files automatically when you log in.

## Quick Start

```bash
granola list                    # Recent meetings
granola search "standup"        # Find meetings
granola show "weekly sync"      # View details
granola transcript "1:1"        # Full transcript ⚡
granola export "retro" ./out.md # Export to markdown
```

## Commands

### Meetings
| Command | Description |
|---------|-------------|
| `list [n]` | List recent meetings (default: 20) |
| `search <query>` | Search by title, notes, or attendee |
| `show <id\|title>` | Show meeting details and notes |
| `transcript <id\|title>` | Fetch transcript ⚡ |
| `export <id\|title> [path]` | Export to markdown |

### People & Companies
| Command | Description |
|---------|-------------|
| `people` | List all people from meetings |
| `companies` | List companies |
| `person <name\|email>` | Meetings with a person |

### Folders & Sharing
| Command | Description |
|---------|-------------|
| `folders` | List folders |
| `folder <name\|id>` | Notes in a folder |
| `shared` | Shared documents |

### Info & Sync
| Command | Description |
|---------|-------------|
| `stats` | Cache statistics |
| `check` | Verify setup |
| `whoami` | Account details |
| `workspaces` | List workspaces |
| `sync` | Refresh from API ⚡ |

⚡ = Makes API call

## Transcript Options

```bash
granola transcript "meeting"               # Full: You/Them + timestamps
granola transcript "meeting" --no-timestamps
granola transcript "meeting" --no-diarize
granola transcript "meeting" --raw         # Plain text only
```

Speaker diarization: **You** (green) = microphone, **Them** (cyan) = system audio.

## Global Options

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |
| `--plain` | No emoji/colors |
| `-h, --help` | Help |
| `-v, --version` | Version |

## Data Sources

Most commands read from **local cache** (fast, offline). Commands marked ⚡ make API calls to Granola servers.

## License

MIT
