---
name: granola-cli
description: Granola meeting notes CLI (list/search/show/export + transcript fetch).
homepage: https://github.com/aaronvanston/granola-cli
metadata: {"clawdbot":{"emoji":"🥣","requires":{"bins":["granola"]}}}
---

# granola-cli

Use `granola` to list/search Granola meetings, view notes, and fetch transcripts.

Quick start
- `granola check`
- `granola list 10`
- `granola search "kickoff" -n 5`
- `granola show "Kickoff - Scheduling"`

Transcripts (uses API ⚡)
- `granola transcript "Kickoff - Scheduling"`
- `granola transcript "Kickoff" --no-timestamps`
- `granola transcript "Kickoff" --no-diarize`
- `granola transcript "Kickoff" --raw`

Invitees vs groups
- Default shows actual invitees (individuals + group emails)
- To expand group directories (may not have attended):
  - `granola show "Kickoff" --expand-groups`
  - `granola transcript "Kickoff" --expand-groups`

Export
- `granola export "Kickoff" ./kickoff.md`

Global output options
- `--json` machine-readable output
- `--plain` no emoji/colors
- `--no-emoji` disable emoji only
- `--no-color` disable ANSI colors

macOS assumptions
- Cache: `~/Library/Application Support/Granola/cache-v3.json`
- Auth: `~/Library/Application Support/Granola/supabase.json`
