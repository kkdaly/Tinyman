# Chaos Daily Snapshot — Design

## Purpose

Daily incremental crawl of Chaos bug bounty data. Capture snapshots, diff against previous day, and surface newly added bounty programs.

## Data Source

`https://chaos-data.projectdiscovery.io/index.json` — returns ~796 programs, each with: `name`, `program_url`, `URL`, `count`, `change`, `is_new`, `platform`, `bounty`, `last_updated`.

## Script: `chaos_daily_snapshot.py`

### Flow

1. Fetch `index.json`
2. Filter to `bounty=true` programs only
3. Write full snapshot → `data/YYYY-MM-DD.json`
4. Find most recent prior snapshot in `data/` (by filename sort, excluding `new_*` files)
5. Diff: `name` as unique key — programs in today not in yesterday = new
6. Print new programs to terminal AND write `data/new_YYYY-MM-DD.json`
7. If no prior snapshot exists (first run), all programs are treated as new

### File Layout

```
data/
  2026-06-01.json      # full bounty snapshot
  2026-06-02.json      # full bounty snapshot
  new_2026-06-02.json  # programs new since 2026-06-01
```

### Diff Rules

- Match by `name` field
- `name` exists today but not yesterday → new
- `name` exists in both but count/other fields changed → NOT new (it's an update)
- First run (no prior snapshot) → all programs marked as new

### Edge Cases & Constraints

- No prior snapshot → all programs reported as new
- API unreachable → print error to stderr, exit non-zero, no snapshot written
- `name` field uniqueness → assumed; same name = same program
- Paths resolved relative to script location (via `Path(__file__).parent`)
- SSL workaround needed for macOS Python (same as `chaos_filter.py`)
