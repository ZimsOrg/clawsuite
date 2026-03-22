# Workspace UI Overhaul — Conductor Visual Inside Workspace

_Written: 2026-03-22_
_Goal: Bring Conductor's polished UI into the Workspace route, wired to daemon state APIs_

---

## Reference Screenshots

### Home Phase (Conductor)
- **CONDUCTOR** badge with green dot (connected indicator)
- **"What should the team do next?"** — large centered heading
- Subtext: "Describe your goal. The workspace daemon will decompose it into tasks and assign agents."
- **Textarea** — large, centered, clean. Placeholder: "Describe the mission, constraints, and desired outcome."
- **Quick actions row** — Research | Build (orange active) | Review | Deploy — pill buttons below textarea
- **Plan Mission →** button — orange, right-aligned, with arrow icon
- **RECENT MISSIONS** — below input, paginated (1/4), compact list with status dot + name + status badge (Running/Completed/Failed)
- **No project grid, no stats bar, no review inbox on this screen** — clean and focused

### Active Phase (Conductor)
- **3-panel layout:**
  - **Left sidebar** — TASKS list with status badges (● Running, ○ Pending), clickable. AGENTS section below showing active agents (● Aurora Coder)
  - **Center panel** — MISSION OVERVIEW with task cards in a horizontal row. Each card shows: task name, agent name, status. The active task card has a blue dot.
  - **Right sidebar** — PROGRESS (Tasks 0/2), TASK STATUS list with status badges, ACTIVE AGENTS, CHECKPOINTS (Total: 0), CONTROLS (+ New Mission button)
- **Top bar** — breadcrumb (← Missions > CONDUCTOR > MISSION NAME), elapsed time, progress pill (0/2 - 0%), Pause button, Stop button
- **Terminal Workspace** — collapsible at bottom ("Expand terminal")
- **No chat sidebar** — that was the OpenClaw sidebar chat overlay, not part of Conductor

---

## What to Build

### Phase 1: Workspace Home (replaces current workspace-mission-input + workspace-recent-missions)

**Single component: `workspace-home.tsx`**

Layout:
```
┌─────────────────────────────────────────────────────────┐
│              WORKSPACE ● (green dot)                     │
│                                                          │
│        What should the team do next?                     │
│   Describe your goal. The workspace daemon will          │
│   decompose it into tasks and assign agents.             │
│                                                          │
│   ┌────────────────────────────────────────────────┐     │
│   │ Describe the mission, constraints, and          │     │
│   │ desired outcome.                                │     │
│   │                                                 │     │
│   └────────────────────────────────────────────────┘     │
│   [Research] [Build●] [Review] [Deploy]   [Plan Mission→]│
│                                                          │
│   RECENT MISSIONS                              1/4  < > │
│   ● Add a GET /api/healthcheck endpoint...    Running    │
│   ● Build a health check endpoint             Running    │
│   ● Build a website about dolphins            Completed  │
└─────────────────────────────────────────────────────────┘
```

Key rules:
- NO project grid on this screen — that lives under a "Projects" tab
- NO stats bar, NO review inbox, NO agent capacity — those are separate tabs
- Just the input + recent missions. Clean and focused like Conductor was.
- When "Plan Mission" is clicked → inline transition to Preview phase (task decomposition review) below the input card
- When "Start Mission" is clicked → navigate to active mission view

### Phase 2: Active Mission (replaces current workspace-mission-monitor)

**Single component: `workspace-active-mission.tsx`**

Layout:
```
┌─────────────────────────────────────────────────────────────────────┐
│ ← Workspace > MISSION NAME          Elapsed: 45s  [0/3-0%] [⏸][⏹] │
├────────┬──────────────────────────────────────┬─────────────────────┤
│ TASKS  │  MISSION OVERVIEW                    │ PROGRESS            │
│        │                                      │ Tasks         0/3   │
│ ● Task │  ┌──────────┐ ┌──────────┐ ┌──────┐ │                     │
│   1    │  │ ● Task 1 │ │ ○ Task 2 │ │○ T3  │ │ TASK STATUS         │
│  RUN.  │  │ Coder    │ │ Pending  │ │Pend. │ │ ● Task 1     RUNNING│
│        │  │ Running  │ │          │ │      │ │ ○ Task 2     PENDING│
│ ○ Task │  └──────────┘ └──────────┘ └──────┘ │ ○ Task 3     PENDING│
│   2    │                                      │                     │
│  PEND. │  AGENT OUTPUT                        │ ACTIVE AGENTS       │
│        │  ┌─────────────────────────────────┐ │ ● Aurora Coder      │
│ ○ Task │  │ Reading files...                │ │                     │
│   3    │  │ Writing src/index.ts...         │ │ CHECKPOINTS         │
│  PEND. │  │ Running tsc --noEmit...         │ │ Total           0   │
│        │  │ ✓ No errors                     │ │ Approved        0   │
│────────│  └─────────────────────────────────┘ │ Pending         0   │
│ AGENTS │                                      │                     │
│ ● Coder│  CHECKPOINT (when available)         │ CONTROLS            │
│        │  ┌─────────────────────────────────┐ │ [+ New Mission]     │
│        │  │ Diff: +45 -12 in 3 files        │ │ [Steer Agent]       │
│        │  │ tsc: ✓  lint: ✓  tests: ✓      │ │                     │
│        │  │ [Approve] [Reject] [Revise]     │ │                     │
│        │  └─────────────────────────────────┘ │                     │
├────────┴──────────────────────────────────────┴─────────────────────┤
│ TERMINAL WORKSPACE                                    [Expand ▲]    │
└─────────────────────────────────────────────────────────────────────┘
```

Key rules:
- 3-panel layout: left sidebar (tasks + agents), center (overview + output + checkpoints), right sidebar (progress + controls)
- Top bar with breadcrumb, elapsed timer, progress pill, pause/stop buttons
- Center panel shows task cards horizontally at top, then AGENT OUTPUT below (live streaming from the active agent's session)
- When a checkpoint arrives, it appears inline below the output
- Checkpoint cards show: diff summary, verification results, approve/reject/revise buttons
- Terminal workspace at bottom (collapsible) — for manual commands if needed
- Mobile: collapses to single column with tabs (Tasks | Output | Progress)

### Phase 3: Complete Phase

When mission completes:
- Show completion banner at top of active mission view
- Task cards all show ✓
- Output preview section with file browser
- "View Output" button opens overlay with iframe preview for HTML
- "New Mission" button to return to home

---

## Data Sources

All data comes from daemon REST API (proxied through ClawSuite):

| Data | Endpoint | Notes |
|------|----------|-------|
| Mission status | GET /missions/:id/status | Name, status, progress |
| Live data | GET /missions/:id/live | Tasks, runs, events |
| Checkpoints | GET /checkpoints?mission_id=X | Pending/approved/rejected |
| Agent output | SSE from daemon | Real-time events |
| Task list | GET /tasks?mission_id=X | All tasks for mission |
| Recent missions | GET /missions?limit=6 | For home screen |

---

## What to Delete

- `workspace-mission-input.tsx` (606 lines) → replaced by workspace-home.tsx
- `workspace-mission-monitor.tsx` (932 lines) → replaced by workspace-active-mission.tsx  
- `workspace-recent-missions.tsx` (346 lines) → merged into workspace-home.tsx

---

## What to Keep

- `workspace-layout.tsx` — the tab container (Projects, Review, Runs, Agents, Skills, Teams)
- All existing hooks and data fetching utilities
- SSE integration (use-workspace-sse.ts)
- Checkpoint detail modal (for full diff review)
- All daemon backend code (tracker, routes, etc.)

---

## Implementation Order

1. Build `workspace-home.tsx` — exact visual match to Conductor home screenshot
2. Build `workspace-active-mission.tsx` — exact visual match to Conductor active screenshot  
3. Wire to daemon APIs (already exist)
4. Wire SSE for live updates
5. Delete old components
6. Test on mobile

---

## Visual Rules (from Conductor)

- Background: `bg-surface` (light gray)
- Cards: white with `border-primary-200`, subtle shadow
- Status dots: `bg-accent-500` (green) for running/connected, `bg-primary-300` for pending
- Active quick action pill: orange background with orange border
- Plan Mission button: orange (`bg-accent-500`) with white text + arrow icon
- Progress pill in top bar: green for healthy, orange for in-progress
- Pause/Stop buttons in top bar: outline style with icons
- Typography: clean, centered, generous spacing on home screen
- No dark mode classes in workspace screens
