# ClawSuite Deep User Flow Test
**Date:** 2026-03-21  
**Branch:** `feat/ux-polish-v3-handshake` (266 commits ahead of main)  
**Tester:** Aurora (subagent — workspace-deep-test)  
**TSC Status:** ✅ Clean — exits 0, no type errors  
**Method:** Full code trace — every component read, every data flow followed

---

## Executive Summary

ClawSuite is **production-capable but not production-polished.** The core mission execution loop is real and solid. The 3 wiring commits that just landed (`b853de7`, `999e211`, `ea6567a`) successfully connected previously orphaned components — but the TODO(orphan) comments in the source files were **never updated** after wiring, leaving stale documentation. This is the most widespread documentation bug in the codebase.

Several UX flows are technically wired but have broken data handoffs. The biggest ones: approving a task in the Kanban doesn't move it to Done, Learnings tab has no persistence, and the Calendar tab shows only cron jobs + mission runs (not granular task data). None of these are ship blockers, but they'll confuse real users.

**Ship blockers: 0**  
**P1 issues: 6**  
**P2 issues: 9**  
**P3 / polish: ~12**

---

## Setup Verification

```
✅ npx tsc --noEmit — exits 0, no errors
✅ Recent commits: feat: wire 9 orphaned components (b853de7)
✅ Recent commits: feat: add Events and Learnings tabs to RunConsole (999e211)
✅ Recent commits: feat: wire Kanban Review gate to approvals system (ea6567a)
✅ Branch: feat/ux-polish-v3-handshake, 266 commits ahead of main
```

---

## Flow 1: Agent Setup

### Steps (first-time user path)
1. Navigate to `/agents` (Agent Hub)
2. Click Configure tab → Agents section
3. Click ⚙️ edit icon on any team member → `AgentWizardModal` opens
4. Set name, model, role, system prompt
5. Save → returns to Configure tab

### What Works ✅
- **AgentWizardModal** is fully functional: name, model, role, memory path, skill allowlist, system prompt
- **Model picker** shows both preset models (15+ including PC1 local models: `pc1-coder`, `pc1-planner`, `pc1-critic`) and live gateway-detected models
- **System prompt templates** are real and comprehensive — 15+ templates across 5 categories:
  - ⚙️ Engineering: Senior Engineer, Code Reviewer, DevOps, Security, Mobile Dev
  - 🔬 Research: Researcher, Data Analyst
  - 📝 Content: Writer, Marketing
  - 🗺️ Ops: Project Manager, Product Manager, QA
  - 🤖 General: General Assistant, Custom
  - Templates shown as clickable chips — active template highlighted in accent color
- **Skill Allowlist** field exists — comma-separated skill names, empty = all allowed
- **Provider setup** (ProviderEditModal): full CRUD for API keys, 18+ providers with branded logos
- **Team templates** via AddTeamModal: pre-built teams (Startup CTO, Full-Stack Sprint, etc.)

### What Breaks ❌
- **No agent test/preview button** — you configure an agent but there's no "Test this agent" UI. The only way to verify a setup works is to run a full mission. For first-time users this is confusing.
- **Skill Allowlist UX is raw** — comma-separated plain text input with a 9px hint. No skill picker, no autocomplete, no validation. Users won't know what skill names to type.

### What's Confusing ⚠️
- **"Backstory" field label** — the system prompt is internally called `backstory`. In the wizard it's labeled "System Prompt" correctly, but the field name leaks into logs and state. Minor.
- **Two separate entry points for the same config**: Configure tab has both an Agent section (edit existing) and a Teams section (team-level config). The difference isn't obvious.
- **ProviderEditModal** says "update/delete" but on first open there's nothing there — user has to know to add keys first. The empty state in Configure → Keys is fine (there's a + button), but the flow is slightly buried.

### What's Missing ⛔
- **"Test Agent" button** — send a quick message to verify the agent is connected before running a mission. P1 for onboarding.
- **Skill picker UI** — show installed skills as checkboxes, not a raw text field. P2.
- **Agent duplication** — no "Clone agent" button for when you want slight variations. P3.

### Fix Priority
| Issue | Priority |
|-------|----------|
| No agent test/preview | P1 |
| Skill allowlist UX (raw text) | P2 |
| Agent clone | P3 |

---

## Flow 2: Mission Creation & Execution

### Steps (first-time user path)
**Direct path:**
1. Navigate to `/agents` → Overview tab
2. Type goal in the textarea
3. Press Enter or click "Launch Mission"

**Wizard path:**
1. Click "New Mission" button → `WizardModal` opens
2. Step 1: Select/confirm gateway
3. Step 2: Select team
4. Step 3: Enter goal
5. Step 4: Review plan
6. Step 5: Confirm + launch

### What Works ✅
- **Both entry paths work** (direct textarea + wizard)
- **Wizard is 5 steps**: gateway → team → goal → plan → review — complete and wired
- **Task decomposition**: `parseMissionGoal()` splits by numbered list, bullets, or semicolons. Works well for structured goals.
- **`buildMockMissionPlan()`**: keyword-based plan generator adds more granular tasks for wizard path — better UX than direct path
- **Assignment**: round-robin to team members at parse time — straightforward and predictable
- **Session spawning**: `ensureAgentSessions()` creates real gateway sessions per agent
- **SSE streaming**: per-agent `EventSource` connections, live output captured
- **Dispatch modes**: parallel, sequential, hierarchical — all wired and functional
- **Retry logic**: 1 automatic retry on SSE failure
- **Auto-complete**: 6s debounce after all agents reach terminal state
- **Mission report**: auto-generated markdown on completion, stored in localStorage (cap 10)
- **Checkpoint restore**: survives page reload via Zustand persist
- **Gateway disconnect handling**: launch button shows "Gateway is offline. Start/connect your gateway before launch." when `gatewayStatus === 'disconnected'`

### What Breaks ❌
- **No LLM task decomposition** — `parseMissionGoal()` is pure regex/heuristic. "Build a full-stack e-commerce app" → 1 task. "Build a React frontend, Node.js backend, and PostgreSQL DB" → 3 tasks (regex split on comma). Real decomposition needs an LLM call.
- **No "save draft" for wizard** — if user starts wizard and closes browser mid-way, nothing is saved. The goal textarea persists in Zustand but the wizard step state does not.
- **No delivery step** — mission completes → report generated → that's it. No "open PR", "post to channel", "commit to repo" from the Hub. (Workspace has this via checkpoints, but Hub users never see it.)

### What's Confusing ⚠️
- **Goal textarea in Overview tab** has no placeholder text explaining what good goals look like. First-time users don't know if they should write one sentence or a structured list.
- **"Launch Mission" label** on the direct path but "Start" in the wizard — inconsistent language.
- **Agent assignment** happens silently — user sees agents get tasks but doesn't understand the round-robin logic. No "why did this agent get this task?" explanation.
- **Sequential vs parallel vs hierarchical** — shown as a dropdown but with zero explanation of what each means. A tooltip or examples would help.

### What's Missing ⛔
- LLM-powered task decomposition (planning API call) — P1
- Save-draft state for wizard — P2
- Hub-level delivery step (post report, open PR) — P2
- Goal templates / example goals in the textarea placeholder — P2

### Fix Priority
| Issue | Priority |
|-------|----------|
| LLM decomposition (heuristic only) | P1 |
| Save wizard draft state | P2 |
| Hub delivery step | P2 |
| Goal input placeholder/examples | P2 |

---

## Flow 3: Kanban & Task Management

### Steps
1. Navigate to `/agents` → Board tab
2. View tasks in 4 columns: Backlog / In Progress / Review / Done
3. Drag a card to move it
4. Right-click a card for context menu (priority, reassign, add note, delete)
5. Drag a card to Review column → approval entry created

### What Works ✅
- **4-column Kanban**: Backlog / In Progress / Review / Done — renders correctly
- **Drag and drop**: full HTML5 DnD with `draggable`, `onDragStart`, `onDrop` — works
- **Drop zone highlighting**: column highlights with `border-orange-400/70` on drag-over
- **Context menu**: right-click shows priority change, agent reassign, add note, delete — all wired
- **Agent assignment dropdown**: per-card inline agent selector
- **Time-in-column tracker**: `formatTimeInColumn()` shows "3m in column", "2h 15m in column", etc. — genuinely useful
- **Priority badges**: Urgent/High/Normal/Low with correct color system
- **Review gate (newly wired)**: dragging a task to Review column calls `addApproval()` — creates a pending approval entry in `localStorage` via `approvals-store.ts`. The `ApprovalsBell` will light up. **This works.**
- **Task merging**: tasks from `HubTask` prop and `useTaskStore` are merged by ID — no duplicates
- **Status mapping**: `inbox`→`backlog`, `assigned`→`in_progress`, `review`→`review`, `done`→`done` — bridge works

### What Breaks ❌
- **After approving a task from the bell, the card does NOT move to Done** — `handleApprove()` in `agent-hub-layout.tsx` only: (1) resolves gateway approval or sends APPROVED message to session, (2) marks approval as `approved` in localStorage. It does **NOT** call `moveTask()` or `updateTaskStatus()`. The card stays in Review indefinitely after approval. This is a P1 UX bug.
- **No "Blocked" column** — there's no visual way to flag a stuck task. Tasks that fail just stay in In Progress with no state change.
- **`moveToNextStatus()` / `moveToPrevStatus()` in task-store are never called** — quick-advance buttons implied by these helpers don't exist anywhere in the UI.

### What's Confusing ⚠️
- **Tasks in Board tab vs Hub Overview task list** — both exist, but they're pulling from different stores (`useTaskStore` for Board, `missionTasks` in mission store for Overview). A task you move in Board may not update the Overview progress bar if the stores aren't in sync.
- **"Drop tasks here" empty state** — fine, but there's no button to create a task directly from the Kanban. Users expect a "+ Add Task" button in each column.
- **Right-click for context menu** — on mobile (touch), right-click doesn't trigger `contextmenu` event naturally. The context menu is completely inaccessible on mobile.

### What's Missing ⛔
- Task completion from approval (approve → auto-move to Done) — P1
- "Blocked" column — P1
- "+ Add Task" button per column — P2
- Context menu accessible on mobile (long-press) — P2

### Fix Priority
| Issue | Priority |
|-------|----------|
| Approve doesn't move task to Done | P1 |
| No Blocked column | P1 |
| Mobile context menu inaccessible | P2 |
| Per-column + Add Task button | P2 |

---

## Flow 4: Approvals & Review

### Steps
1. An agent moves to Review OR an agent emits `APPROVAL_REQUIRED:` in SSE output
2. `ApprovalsBell` in header shows badge with count (polls every few seconds)
3. Click bell → dropdown shows up to 3 pending approvals
4. Approve or Deny inline
5. For full list: Configure tab → Approvals section → `ApprovalsPage`

### What Works ✅
- **`ApprovalsBell`**: polling works, badge count is correct, pulsing ring animation on new arrivals ✅
- **Bell dropdown**: shows agent name, action text, time ago, Approve/Deny buttons — clean and functional ✅
- **Kanban Review gate**: dragging to Review creates an approval entry — wired and confirmed ✅
- **SSE APPROVAL_REQUIRED**: agent output containing `APPROVAL_REQUIRED:` prefix triggers an approval entry in the same system ✅
- **Gateway approvals** (tool-use): `ApprovalsBell` also polls `/api/gateway/approvals` and merges those in ✅
- **`ApprovalsPage`** (newly wired in Configure tab): full-page view with pending queue + history. Polls every 2s. Risk-level badges (low/medium/high). Resolving IDs tracked to prevent double-submit ✅
- **History panel**: shows resolved approvals (approved/denied) from localStorage, up to 80 entries ✅
- **Approve action**: sends `[APPROVED] You may proceed with: <action>` message to agent session, unblocks `waiting_for_input` status ✅

### What Breaks ❌
- **Approving a task-based approval (from Kanban Review) does NOT move the task to Done** — as noted in Flow 3, `handleApprove()` resolves the approval and messages the agent, but does not update Kanban card status. The card stays in Review. A user approving via the bell will be confused why the task didn't advance. **P1.**
- **ApprovalsPage still has TODO(orphan) comment at line 1** — stale doc comment says "not imported or rendered anywhere." It IS rendered (in Configure tab → Approvals section). This is just confusing for contributors. **P2 (doc fix).**
- **Bell shows only 3 items max** with a "+N more pending in Approvals tab" footer — but that footer is wrong. It should say "Configure tab" or "Approvals page," not "Approvals tab" (there is no "Approvals tab" in the hub nav). **P2 UX copy bug.**

### What's Confusing ⚠️
- **Two parallel approval systems**: gateway tool-use approvals and agent-based approvals look identical in the bell but have different internal IDs. A user sees `source: agent` or `source: gateway` in the ApprovalsPage — but most users won't know what that means.
- **No notification** (toast, banner, sound) when a new approval arrives. The bell pulses once with an animation but it's subtle. Mobile users will miss it entirely.
- **Configure tab → Approvals** is buried. Most users will only see the bell, not know the full page exists.

### What's Missing ⛔
- Auto-advance Kanban card to Done after approval resolves — P1
- Toast notification on new approval arrival — P2
- Update stale TODO(orphan) comments across all 6 files — P2

### Fix Priority
| Issue | Priority |
|-------|----------|
| Approval → task still in Review (no auto-advance to Done) | P1 |
| Stale TODO(orphan) comments in 6 files | P2 (doc) |
| Bell footer copy: "Approvals tab" → "Approvals page" | P2 |
| New approval toast/notification | P2 |

---

## Flow 5: Run Console & Monitoring

### Steps
1. Run a mission → navigate to Runs tab
2. `RunConsole` renders with 6 tabs: Stream, Timeline, Artifacts, Report, Events, Learnings
3. Also accessible: RunCompare toggle (side-by-side run metadata)

### What Works ✅
- **Stream tab**: live SSE events pulled via `fetchSessionHistory` polling (5s interval when running), deduped, sorted. Combined and Lanes view toggle. Auto-scroll with "Jump to latest" sticky button. **Works well.**
- **Timeline tab**: groups events into minute-buckets with elapsed time, dot-coded by event type. Visual and scannable. ✅
- **Artifacts tab**: shows collected files/outputs/commits. Copy button, expand to view content. ✅ (requires artifacts prop to be populated — may be empty for most missions)
- **Report tab**: structured mission summary with Key Findings, Duration, Tokens, Cost, Agent Breakdown table. ✅
- **Events tab (newly wired)**: renders `MissionEventLog` component with events passed from `useMissionEventStore`. Has filters (All/Agent Events/Task Events/Errors Only). ✅
- **Learnings tab (newly wired)**: renders `RunLearnings` with local ephemeral state as fallback. Can add/filter/copy learnings inline. ✅
- **Agent control bar**: Steer + Kill buttons per agent when mission is running ✅
- **Pending approvals sticky banner** at top of stream ✅
- **Stop button** when running ✅
- **RunCompare**: side-by-side metadata comparison — duration, tokens, cost, agent count, status delta — works ✅

### What Breaks ❌
- **Events tab shows 0 events for completed missions** — `useMissionEventStore` is non-persisted. Events are captured in-memory during the run and passed live to RunConsole, but if the user navigates away and comes back, events are gone. The "No mission events recorded for this run yet" message is misleading — they existed, they're just lost. **P1 UX deception.**
- **Learnings tab has no persistence** — `localLearnings` is local `useState`. Close the modal, lose the learnings. The `RunLearnings` component itself says it needs a learning store. **P2.**
- **RunCompare output diff is metadata only** — comparing two runs only shows duration/tokens/cost/status. No side-by-side output diff. Users who want to compare "what the agent said" in run A vs run B are out of luck. **P2.**
- **Mock events show when no session keys provided** — if `sessionKeys` prop is empty or undefined, `RunConsole` shows 3 hard-coded mock events ("Session initialized and task context loaded", "Executed repository scan", etc.) regardless of run status. This will confuse users who see "live" data that's actually fake. **P1.**
- **Artifacts tab is always empty for most missions** — the `artifacts` prop is passed from the Hub, but the Hub never populates it (`artifacts={[]}` or not set). The "No artifacts collected yet" message appears for every run. **P2.**

### What's Confusing ⚠️
- **6 tabs is a lot** — Stream, Timeline, Artifacts, Report, Events, Learnings. First-time users won't know which to look at. No "recommended" tab or auto-switch based on run state (e.g., auto-open Report on completion).
- **"Learnings" tab** — the concept of manually adding learnings about a run is unclear without any explanation text. The empty state needs a better explainer.
- **Stream badge count** on the tab button shows `displayEvents.length` — but this includes mock events when no real data is available. Badge shows "3" when the 3 events are hard-coded mocks. Misleading.

### What's Missing ⛔
- Event persistence (archive to mission checkpoint) — P1
- Learning persistence store — P2
- Artifact collection in the Hub (currently never populated) — P2
- Auto-switch to Report tab on mission completion — P2
- Output diff in RunCompare — P2
- Clear label that distinguishes live vs mock stream events — P1

### Fix Priority
| Issue | Priority |
|-------|----------|
| Mock events shown as real data | P1 |
| Events tab empty after navigation (no persistence) | P1 |
| Artifacts always empty (Hub doesn't populate prop) | P2 |
| Learnings have no persistence | P2 |
| RunCompare output diff missing | P2 |
| Auto-switch to Report on completion | P2 |

---

## Flow 6: Skills Management

### Steps
1. Navigate to `/workspace` → Skills tab (`WorkspaceSkillsScreen`)  
   OR navigate to `/agents` → Configure → (no skills section in Configure)  
   OR top-level nav route at `/skills` → `SkillsScreen`

### What Works ✅
- **`SkillsScreen`** (full browser at `/skills`): Installed / Marketplace / Featured tabs — all functional
- **Installed tab**: scans `~/.openclaw/workspace/skills/` recursively for SKILL.md files. Also includes OpenClaw built-in skills (resolved via npm global path). Sorted by name/category.
- **Marketplace tab**: first tries local git registry (`~/.openclaw/workspace/openclaw-skills-registry/`). If not found, falls back to **ClawHub API** (`https://clawhub.ai/api/v1/skills`) — **real API, not stubbed**. Fetches all pages with cursor pagination (up to 1000 skills).
- **Featured tab**: hardcoded list of 12 skills pulled from marketplace data. Gracefully fills to 12 from popular if registry is sparse.
- **Enable/disable toggle**: creates/removes `.disabled` file in skill folder — file-system backed. ✅
- **Install from marketplace**: copies skill folder from registry to installed root. ✅
- **Uninstall**: `rm -rf` the installed skill folder. ✅
- **Security scanning**: built-in scanner checks skill files for `sudo`, `rm -rf`, `eval()`, `exec()`, `curl`, etc. Scores and labels Low/Medium/High risk. Shows flags inline. ✅
- **Category filtering**: 14 categories, derived from skill metadata + text pattern matching. ✅
- **Search**: tiered ranking — name match (tier 0) > tags/triggers (tier 1) > description (tier 2) — good UX ✅
- **5-minute cache**: in-memory, invalidated on install/uninstall/toggle ✅
- **`WorkspaceSkillsScreen`**: shows installed skills + memory files (AGENTS.md, memory/\*.md, etc.) in a combined view. Different purpose (workspace context, not skill management).

### What Breaks ❌
- **No skill assignment to specific agents from Skills screen** — `AgentWizardModal` has a "Skill Allowlist" text field, but you have to know the skill name and type it manually. There's no "assign skill to agent" flow from the Skills screen itself. The two UIs are disconnected. **P2.**
- **Marketplace tab can take 10-30s to load** on first visit (git clone of registry). No progress indicator — just a spinner and nothing for 30 seconds. **P2.**
- **`WorkspaceSkillsScreen`** is labeled "Skills" in the Workspace tab but it actually shows memory files (AGENTS.md, memory/YYYY-MM-DD.md), not skills per se. The name is misleading for first-time users.

### What's Confusing ⚠️
- **Two "Skills" surfaces**: `/skills` route (full skill browser) and Workspace → Skills tab (memory file viewer). Same label, completely different purposes. The nav needs disambiguation.
- **Security risk badges** show up on every installed skill. Skills like the built-in `weather` skill get "low risk" badges because they use `fetch()`. Legitimate skills will scare users unnecessarily.
- **"Featured" tab** is hardcoded to 12 specific skill IDs (`dbalve/fast-io`, `okoddcat/gitflow`, etc.). If those skills aren't in the registry, Featured silently fills from "Most Popular." Users won't know what "Featured" actually means.

### What's Missing ⛔
- Skills-to-agent assignment flow from Skills screen (not just from AgentWizardModal) — P2
- Marketplace loading progress indicator (git clone takes 30s) — P2
- Clarify naming: Workspace → "Skills" should be "Memory Files" or "Workspace Context" — P2

### Fix Priority
| Issue | Priority |
|-------|----------|
| No skills → agent assignment from Skills screen | P2 |
| Marketplace first-load has no progress (30s wait) | P2 |
| WorkspaceSkillsScreen label mislabeled | P2 |

---

## Flow 7: Calendar / Agenda

### Steps
1. Navigate to `/agents` → Calendar tab (📅)
2. View month/week/day grid with cron jobs and mission runs
3. Toggle to Agenda view

### What Works ✅
- **CalendarView is now wired** (commit `b853de7`) — renders in the Calendar tab ✅
- **Three view modes**: Month, Week, Day — with Framer Motion transitions between them ✅
- **Cron job events**: parsed from schedule strings (cron syntax AND natural language like "every monday at 9am"). Multiple schedule formats supported. ✅
- **Mission run events**: shown by start date, color-coded by status (running/complete/failed) ✅
- **Navigation**: Previous/Next arrows, "today" highlighted ✅
- **AgendaView toggle**: Calendar/Agenda button pair wired via `calendarViewMode` state ✅
- **Month grid**: shows max 3 events per day cell, "+N more" overflow label ✅
- **Week view**: time-slotted grid (44px per hour), handles overflow to "+N more" ✅
- **Day view**: full 24-hour timeline with event cards per hour slot ✅
- **Click handler**: `onSelectEvent` callback is wired through to the Hub's handler ✅

### What Breaks ❌
- **Calendar shows cron jobs + mission runs only — NOT individual tasks** — a user who wants to see "what tasks are due/scheduled today" will find the Calendar empty if there are no cron jobs and no completed/running missions. Task scheduling doesn't exist as a concept in the current data model. **P2.**
- **Cron jobs must be `enabled: true`** to appear on Calendar. Disabled cron jobs are silently excluded. No indication of this to users. **P3.**
- **TODO(orphan) comment still at line 1 of `calendar-view.tsx`** — says "not imported or used anywhere in the app." It is imported and used. Stale comment. **P2 doc.**

### What's Confusing ⚠️
- **Empty state**: if there are no cron jobs and no mission runs, the Calendar renders a full empty grid with zero explanation of what it's supposed to show. A first-time user will have no idea what to expect.
- **"Agenda" label**: the toggle says 📅 Calendar / 📋 Agenda but both show the same data source (cron + missions). Agenda view from `AgendaView` component shows a list format — functionally distinct, but the distinction isn't clear.
- **Mission runs show by start date only** — a mission that ran for 3 hours shows only on the start hour. No duration indication on the calendar.

### What's Missing ⛔
- Task scheduling (assign a task a due date that shows on calendar) — P2
- Empty state with explainer text — P2
- Fix stale TODO(orphan) comments — P2

### Fix Priority
| Issue | Priority |
|-------|----------|
| Empty state with no explanation | P2 |
| Tasks not shown (no scheduling concept) | P2 |
| Stale TODO(orphan) comments | P2 (doc) |

---

## Flow 8: Terminal Workspace

### Steps
1. Navigate to `/terminal`
2. xterm.js terminal loads (SSR-safe dynamic import)
3. New tab via + button
4. Type commands
5. Context-menu on tab for rename/close

### What Works ✅
- **xterm.js** dynamically imported (SSR-safe via `ensureXterm()` with `xtermLoaded` guard) ✅
- **PTY connection**: each terminal tab connects to `/api/terminal-stream` for real PTY ✅
- **Multi-tab**: `useTerminalPanelStore` tracks up to N tabs. + button adds a new tab. ✅
- **Tab context menu**: right-click → rename/close via `ContextMenuState` ✅
- **FitAddon**: auto-resizes terminal to container — resize event handled ✅
- **WebLinksAddon**: clickable URLs in terminal output ✅
- **Panel / fullscreen modes**: TerminalWorkspace accepts `mode: 'panel' | 'fullscreen'` prop ✅
- **Debug panel**: `DebugPanel` component for AI-assisted error analysis built in ✅
- **Default CWD**: `~/.openclaw/workspace` — sensible default ✅
- **Keyboard shortcuts**: standard xterm behavior ✅

### What Breaks ❌
- **Terminals are NOT connected to specific agent sessions** — each terminal is a standalone PTY, not wired to any agent session key. A user expecting "open a terminal for Agent X" will get a generic shell. To steer agents you use the Steer button in RunConsole, not the terminal. **P2 (expectation mismatch).**
- **PTY grid (multi-pane)** — the WORKSPACE_AUDIT.md mentioned "PTY grid" but the implementation is a **tab-based** multi-terminal (one terminal visible at a time), not a split-pane grid. The DebugPanel takes the right panel. No actual tile/grid layout. **P2 (expectation mismatch).**

### What's Confusing ⚠️
- **No clear entry point from Agent Hub to Terminal** — if a user wants to run terminal commands in the context of a mission, there's no "Open Terminal" button on any mission card. Navigation to `/terminal` is via the sidebar only.
- **DebugPanel** is available but there's no explanation of what it does unless you look at the code. The button/toggle for it isn't obvious.

### What's Missing ⛔
- Agent-session-bound terminals (open a terminal for a specific agent session) — P2
- Split-pane PTY grid layout — P3
- "Open Terminal" button from mission context — P3

### Fix Priority
| Issue | Priority |
|-------|----------|
| Terminals not bound to agent sessions | P2 |
| No split-pane grid (tabs only) | P3 |
| No "Open Terminal" from mission context | P3 |

---

## Cross-Cutting Issues

### Mobile Responsiveness
**Status: Partial** — the codebase has extensive responsive classes (`sm:`, `lg:`, `md:`), but several critical flows are mobile-hostile:

- **KanbanBoard context menu**: right-click only, inaccessible on touch. P1 for mobile.
- **Lanes view in RunConsole**: horizontal scroll required for 3+ agents. Works but cramped on mobile.
- **AgentWizardModal**: `max-w-2xl` with a grid of template chips. On small screens (~375px) the chip grid overflows. The `grid-cols-1 sm:grid-cols-2` layout helps but template chips are very small on mobile.
- **Calendar week view**: `min-w-[760px]` with `overflow-x-auto` — scrollable on mobile but not ideal.
- **Kanban grid**: `min-w-[52rem]` with `overflow-x-auto` — scrollable, not broken.
- **Hub tab bar**: 5+ tabs on mobile wraps with `flex-wrap gap-2` — acceptable but slightly crowded.
- **PresenceIndicator + tab nav**: both render in the same header area on mobile — may overlap.

### Dark/Light Mode
**Status: Complete** — all components use CSS variables `var(--theme-bg)`, `var(--theme-card)`, `var(--theme-text)`, `var(--theme-border)` alongside Tailwind `dark:` classes. Both themes are handled everywhere. ApprovalsBell uses `dark:border-neutral-700` etc. consistently.

One inconsistency: **RunConsole** uses hardcoded `bg-[var(--theme-bg,#0b0e14)]` and `dark:bg-slate-900` — these are slightly different dark values and may cause a visible discrepancy between the console background and the surrounding layout.

### Error States
- **Gateway disconnected**: launch button shows clear warning ("Gateway is offline. Start/connect your gateway before launch.") ✅
- **Network error in provider test**: shows "Network error — could not reach gateway" toast ✅
- **AgentHubErrorBoundary**: `agent-hub-error-boundary.tsx` exists — wraps the hub to catch React errors ✅
- **Skill fetch failure**: error shown in-component ✅
- **ApprovalsPage gateway error**: inline error banner (red) on failed fetch ✅
- **Missing**: no error state for when an agent session fails to spawn and retry also fails — the UI shows agent as "error" status but there's no recovery prompt for the user.

### Loading States
- **Mission history loading**: "// loading mission history…" monospace placeholder ✅
- **Skills screen**: uses `useQuery` with React Query — loading/error states handled ✅
- **ApprovalsPage**: "Loading approvals..." text while initial fetch runs ✅
- **RunConsole stream**: "Live event stream will appear here" when empty ✅
- **Missing**: no skeleton/shimmer anywhere. All loading states are text-only. This is fine but a skeleton would feel more polished for mission cards and agent cards.

### Empty States
- **Kanban board columns**: "Drop tasks here" (dashed border box) ✅
- **Mission history**: "// start a mission to see it recorded here" ✅
- **Approvals page pending queue**: "✅ No pending approvals / Agents can continue without intervention" ✅
- **RunConsole artifacts**: "No artifacts collected yet" ✅
- **RunConsole events**: "No mission events recorded for this run yet" ✅ (misleading when events existed but weren't persisted — see Flow 5)
- **Calendar**: no empty state — just renders an empty grid. **P2 fix needed.**
- **Configure → Providers**: no explicit "no keys yet" empty state — just a blank section with a + button.

---

## Stale Documentation Audit

The following 6 source files have **TODO(orphan) comments that are now incorrect** — the components ARE imported and used after commit `b853de7`:

| File | Stale Comment Says | Reality |
|------|--------------------|---------|
| `calendar-view.tsx` line 1 | "not imported or used anywhere" | Imported in agent-hub-layout.tsx, renders in Calendar tab |
| `agenda-view.tsx` line 1 | "not imported or used anywhere" | Imported, renders as toggle in Calendar tab |
| `approvals-page.tsx` line 1 | "not imported or rendered anywhere" | Imported, renders in Configure → Approvals section |
| `run-learnings.tsx` line 1 | "not imported or used anywhere" | Imported in run-console.tsx, renders as Learnings tab |
| `agents-working-panel.tsx` line 1 | "never rendered" | Imported, renders in Overview tab (mobile) |
| `live-activity-panel.tsx` line 1 | "not imported or used anywhere" | Imported, renders in Overview tab (desktop) |

**Fix:** Remove or update these 6 TODO(orphan) comments. One-liner fix per file.

---

## Priority Summary

### P0 (Ship Blockers)
**None.** TSC clean. Core loop works. App is shippable.

### P1 (Should Fix Before Phase 1 Push)
| # | Issue | Files |
|---|-------|-------|
| 1 | Mock events shown as real data in RunConsole stream | `run-console.tsx` |
| 2 | Events tab empty after navigation (mission-event-store not persisted) | `mission-event-store.ts`, `agent-hub-layout.tsx` |
| 3 | Approve doesn't move Kanban task to Done | `agent-hub-layout.tsx` (handleApprove) |
| 4 | No Blocked column in Kanban | `kanban-board.tsx` |
| 5 | No agent test/preview before deploying | `config-wizards.tsx` |
| 6 | LLM decomposition missing (heuristic only) | `agent-hub-layout.tsx`, new API route |

### P2 (Should Fix Soon)
| # | Issue | Files |
|---|-------|-------|
| 1 | Stale TODO(orphan) comments in 6 files | 6 component files |
| 2 | Bell footer says "Approvals tab" (wrong) | `approvals-bell.tsx` |
| 3 | Artifacts always empty (Hub never populates prop) | `agent-hub-layout.tsx` |
| 4 | Learnings have no persistence | New `learnings-store.ts` |
| 5 | Marketplace first-load: no progress bar (30s git clone) | `skills-screen.tsx` |
| 6 | Calendar empty state has no explanation | `calendar-view.tsx` |
| 7 | Skill allowlist UX is raw text (no picker) | `config-wizards.tsx` |
| 8 | Kanban context menu inaccessible on mobile | `kanban-board.tsx` |
| 9 | WorkspaceSkillsScreen labeled "Skills" but shows memory files | `workspace-skills-screen.tsx` label |

### P3 (Polish)
- Split-pane PTY grid layout in terminal
- "Open Terminal" from mission context
- Skeleton/shimmer loading states
- Agent clone button in config wizard
- Mission runs show duration on Calendar (not just start time)
- Auto-switch RunConsole to Report tab on mission completion
- RunCompare output diff (currently metadata only)
- Patrol Agent / Agent Scoring (not built)

---

## Final Verdict

**Ship it.** The 266-commit branch delivers a genuinely impressive multi-agent orchestration system. The wiring commits landed cleanly — orphaned components are now wired, the Review gate triggers approvals, RunConsole has 6 working tabs.

The **3 most important fixes before pushing** are:
1. Fix the mock-events-as-real-data issue in RunConsole — it actively deceives users
2. Wire `handleApprove` to advance the Kanban task to Done — the most visible broken loop
3. Clean up the 6 stale TODO(orphan) comments — they're actively misleading for contributors

Everything else is polish. The foundation is solid.
