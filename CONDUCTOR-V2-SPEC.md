# Conductor V2 — Active Phase Redesign

## Current Problems
1. Terminal workspace is useless — nobody uses it
2. Live output shows garbage (fragments like "zero", "errors", dots)
3. Right sidebar duplicates task list from left sidebar
4. Complete phase is a separate view — should be same page with a modal/overlay
5. No way to chat/steer agents from Conductor
6. Mission overview cards are mostly empty space
7. Agent output should match what you see when spawning sub-agents in chat

## Design: Single-Page Active View

### Layout: 2-column (left: tasks+agents, right: main content)

```
┌─────────────────────────────────────────────────────────────────┐
│ ← Missions  CONDUCTOR > BUILD AN XBOX CONTROLLER   Pause  Stop │
├──────────────┬──────────────────────────────────────────────────┤
│ TASKS        │  LIVE AGENT OUTPUT                              │
│ ● Clarify ✓  │  ┌──────────────────────────────────────────┐   │
│ ● Build  🔄  │  │ Aurora Coder is working on:              │   │
│              │  │ build an xbox controller                  │   │
│──────────────│  │                                           │   │
│ ACTIVE AGENT │  │ Reading package.json...                   │   │
│ Aurora Coder │  │ Creating src/components/Controller.tsx... │   │
│ ├ Click to   │  │ Added button mapping for A, B, X, Y...   │   │
│ │ steer/chat │  │ Running npx tsc --noEmit...              │   │
│              │  │ 0 errors                                  │   │
│ CHECKPOINTS  │  │ Committing changes...                    │   │
│ (pending)    │  └──────────────────────────────────────────┘   │
│              │                                                  │
│              │  [Checkpoint: 3 files changed +45 -2]           │
│              │  [Approve] [Reject] [View Diff]                 │
└──────────────┴──────────────────────────────────────────────────┘
```

### Key Changes

1. **Remove Terminal Workspace** — it's not useful in Conductor
2. **Right sidebar → merge into left sidebar** — tasks, active agents, checkpoints all in one rail
3. **Main area = live agent output** — show the FULL agent session output, not 8 truncated lines. This should look like the AgentOutputPanel / chat stream, not a log snippet
4. **Active agents are clickable** — click to steer/chat (like the agent hub sidebar chat)
5. **Checkpoints appear inline** in the output stream when they fire
6. **No separate complete phase** — when mission completes, show a completion banner at top + output preview modal/overlay. Stay on the same page.
7. **Output preview** — "View Output" button opens an overlay with file browser + iframe preview for HTML

### Agent Output Quality
The current output is garbage because:
- SSE only captures 12 lines, Conductor shows 8
- The Codex adapter emits raw fragments, not meaningful messages
- Need to show the actual agent session output — tool calls, file reads, code writes

The fix: use the AgentOutputPanel component (already exists in ClawSuite) which connects to the agent's session and shows full chat-style output with tool call cards, elapsed timers, etc.

### Mission Completion Flow
Instead of navigating to a separate "complete" phase:
1. Show a "Mission Complete" banner at top of the same page
2. Auto-expand the output preview section
3. Show checkpoints with approve/reject
4. "View Output Files" opens an overlay/modal with the file browser
5. "New Mission" button in the banner

### What to Keep
- Home phase (input card + recent missions + filters) ✅
- Preview phase (task decomposition review) ✅  
- localStorage persistence ✅
- SSE event streaming ✅
- Checkpoint approve/reject/merge/PR actions ✅

### What to Remove
- Terminal Workspace (bottom panel)
- Right sidebar (redundant with left)
- Separate complete phase view
- Mission overview cards (the task summary cards with dots)

### Implementation Priority
1. Remove terminal, merge sidebars → immediate cleanup
2. Wire AgentOutputPanel as main content area → real output
3. Inline completion banner → no more separate phase
4. Output preview overlay → polished viewing experience
5. Agent steer/chat in sidebar → interactive control
