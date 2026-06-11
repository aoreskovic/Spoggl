# Spoggl

> A Toggl-inspired time tracking plugin for [Super Productivity](https://super-productivity.com)

Spoggl replaces SP's default time tracking with a full-featured sidebar panel: live timer, visual day timeline, Jira worklog bulk-sync, and bidirectional native timer integration.

---

## Features

### ⏱ Timer
- Omnibar with live task search across all SP tasks
- Start/stop with editable start time (set the clock before hitting Start)
- **Bidirectional sync with SP's native toolbar timer** — starting either one starts the other automatically
- Auto-merges consecutive entries for the same task if the gap is under 30 minutes (with a merge/keep prompt)

### 📅 Day View Timeline
- Visual timeline of the current or any past day (7 AM–8 PM default, auto-expands to cover all entries)
- **Overlap columns** — concurrent entries split side by side, Toggl-style
- Live "in-progress" block grows in real time and participates in the overlap layout
- Drag entry blocks to move them in 15-minute intervals
- Drag top/bottom handles to resize start/end time; **snaps to adjacent entry boundaries**
- Right-click context menu: restart timer, split entry at midpoint, delete
- Zoom in/out controls; resizable panel width via drag
- Configurable font size (8–12 px)

### 📌 Pinned Tasks
- Pin frequently-used tasks for one-click timer start
- Compact (chips) or stacked (list) layout
- Configurable label style (tag, tag name, or task name)

### 🗂 Task Sections (individually collapsible)
- **Today** — tasks due today from SP's schedule
- **Assigned to me** — Jira issues where you are the assignee, fetched live from Jira API
- **Other Tasks** — inbox and overdue tasks

### 🔗 Jira Worklog Sync
- **Finish Day** bulk-submits all entries with Jira IDs as worklogs in one click
- Entries without a Jira ID are marked done locally — the day still finishes cleanly
- **Auto-detect Jira credentials** from SP's own native Jira integration — no double entry
- Test connection button to verify credentials before committing
- Retry dialog for any failed entries

### 🎨 Theme & UX
- Follows SP's light/dark theme automatically
- Debug panel for diagnosing SP API connectivity issues
- Data persisted and synced across SP windows via SP's sync API

---

## Screenshots

| | |
|---|---|
| ![Main view](docs/screenshots/01-main-view.png) | ![Timer running](docs/screenshots/02-timer-running.png) |
| *Main view — timer, entry list, timeline* | *Active timer with Jira chip and elapsed time* |
| ![Day view](docs/screenshots/03-day-view-timeline.png) | ![Overlap columns](docs/screenshots/04-overlap-columns.png) |
| *Day view timeline with hour grid and entries* | *Overlap columns — two concurrent tasks side by side* |
| ![Task sections](docs/screenshots/05-task-sections.png) | ![Settings](docs/screenshots/06-settings.png) |
| *Collapsible Today / Assigned / Other sections* | *Settings panel with Jira config* |
| ![Finish day](docs/screenshots/07-finish-day.png) | ![Dark mode](docs/screenshots/08-dark-mode.png) |
| *Finish Day — Jira worklog bulk-sync* | *Dark theme following SP's color scheme* |

---

## Installation

1. Clone or download this repository
2. In Super Productivity, open **Settings → Plugins → Install plugin from folder**
3. Select the `spoggl/` folder
4. Spoggl appears as a panel on the right side of SP

> Requires Super Productivity ≥ 14.0.2

---

## Usage

### Starting a timer

1. Click the search field at the top and type to find a task — results come from your SP task list
2. Select a task (or type a custom entry name) and click **▶ Start**
3. SP's toolbar timer starts automatically in sync
4. Click **■ Stop** to save the entry to today's log

**Or** — click any task in the Today / Assigned to me / Other sections to start immediately.

### Editing entries

- Click any field in the entry list (start time, end time, duration, title) to edit inline
- Drag entry blocks in the timeline to move them (15-minute snap)
- Drag the **top handle** to adjust start time; drag the **bottom handle** to adjust end time
- Handles snap to boundaries of adjacent entries automatically
- Right-click any block for: restart, split at midpoint, delete

### Finishing the day

1. Click **Finish Day** at the top of the entry list
2. All entries with a Jira ID are submitted as worklogs
3. Entries without a Jira ID are marked as done locally
4. If any submission fails, a dialog lists the failures with a **Retry failed** button

### Pinning tasks

- Click the **📌** pin icon next to any task to add it to pinned tasks
- Pinned tasks appear at the top of the panel for instant one-click timer start
- Right-click a pin to remove it

---

## Configuration

Click the **⚙** icon to open Settings:

| Setting | Description |
|---|---|
| **Auto-detect from SP** | Reads Jira credentials directly from SP's native Jira integration — no re-entry needed |
| **Test connection** | Makes a live call to `GET /rest/api/2/myself` to verify credentials |
| **Base URL** | Your Jira instance URL, e.g. `https://yourcompany.atlassian.net` |
| **Email** | Your Atlassian account email |
| **API Token** | Generate at [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens) |
| **Pin layout** | Compact (tag chips) or stacked (full rows) |
| **Pin label** | Show tag, tag name, or task name on pin chips |
| **Font size** | Day view timeline label font size (8–12 px) |

---

## Roadmap

Ideas for future improvements — PRs welcome:

- [ ] **Weekly / monthly summary** — totals by project, tag, or Jira epic
- [ ] **CSV / JSON export** — export time entries for external reporting
- [ ] **Idle detection** — auto-pause timer after inactivity, prompt on return
- [ ] **Keyboard shortcuts** — start/stop, navigate dates, open search without mouse
- [ ] **Entry notes** — attach a comment or description to each time entry
- [ ] **Color coding** — color-code entries by SP project or tag
- [ ] **Multiple Jira instances** — support more than one Jira connection simultaneously
- [ ] **Estimated vs actual** — compare SP task time estimates against logged time
- [ ] **Recurring entry templates** — save templates for daily standup, meetings, etc.
- [ ] **Pomodoro mode** — optional 25-minute countdown timer with break prompts
- [ ] **Google Calendar sync** — push completed entries as calendar events
- [ ] **Worklog comment templates** — pre-fill worklog comments by task type or project

---

## How it works

Spoggl runs as an iframe plugin inside Super Productivity and uses the `window.PluginAPI` bridge:

| API | Purpose |
|---|---|
| `getTasks()` | Loads all SP tasks for search and sections |
| `persistDataSynced` / `loadSyncedData` | Persists entries and settings across windows |
| `dispatchAction('[Task] SetCurrentTask')` | Starts/stops SP's native toolbar timer |
| `CURRENT_TASK_CHANGE` hook | Reacts when SP's native timer changes task |
| `ACTION` hook | Refreshes task list when SP modifies tasks |
| IndexedDB `SUP_OPS → state_cache` | Reads Jira credentials from SP's own storage without requiring re-entry |

---

## License

MIT
