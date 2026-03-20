# HurleyUS Agent OS

**Live, interactive, shell-native agent orchestration system**

Stream-based task execution with full zsh context, real-time WebSocket reporting, and Ink terminal UI.

## Architecture

```
┌─────────────────────────────────────────────┐
│ Orchestrator (orchestrator.ts + Ink)        │
│ - Task queue management                     │
│ - Agent lifecycle                           │
│ - WebSocket server (ws://localhost:9999)    │
│ - Real-time terminal UI                     │
│ - State persistence                         │
│ - Session transcripts                       │
└─────────────┬───────────────────────────────┘
              │
       WebSocket (JSON)
              │
    ┌─────────┴──────────┬──────────┐
    │                    │          │
    ▼                    ▼          ▼
┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐
│ Agent 1 │  │ Agent 2 │  │ Agent 3 │  │ Agent 4 │
│ (zsh)   │  │ (zsh)   │  │ (zsh)   │  │ (zsh)   │
│         │  │         │  │         │  │         │
│ Task    │  │ Task    │  │ Task    │  │ Task    │
│ Exec    │  │ Exec    │  │ Exec    │  │ Exec    │
└─────────┘  └─────────┘  └─────────┘  └─────────┘
     │              │           │            │
     └──────────────┴───────────┴────────────┘
                    │
            ~/.zshrc + shell env
            ~/.hurleyus/GOALS
            ~/.hurleyus/TASKS
```

## Features

### 1. Shell-Native Execution
- Each agent runs in a **real, interactive `zsh` shell**
- Full access to `~/.zshrc` aliases, functions, and environment
- Can execute any shell command, git operations, or CLI tool
- Streams input/output bidirectionally

### 2. Live Terminal UI (Ink)
- Task queue visualization
- Agent pool status (busy/idle)
- Real-time log viewer
- Progress tracking

### 3. WebSocket Real-Time Communication
- Agents connect: `ws://localhost:9999?agent=<name>`
- Receive task assignment in real-time
- Stream output as it happens (not after completion)
- Automatic reconnect on failure

### 4. Full Session Transcripts
- Every keystroke logged: `~/.hurleyus/agent-os/sessions/<sessionId>.log`
- Includes task description, shell input, output, git operations
- Searchable history for debugging

### 5. Automatic Git Integration
- Agent auto-detects if task is in a git repo
- Prompts to commit after task completion
- Auto-pushes to origin/HEAD
- Commit message: `[agent-name] task-id`

### 6. State Persistence
- Task queue saved to `~/.hurleyus/agent-os/state.json`
- Survives orchestrator restarts
- All logs preserved

## Usage

### 1. Start the Orchestrator

```bash
cd ~/.openclaw/workspace/agent-os
bun cli.ts run-orchestrator
```

Output:
```
🚀 HurleyUS Agent OS
ws://localhost:9999 | OpenClaw: ws://192.168.1.134:18789
...
Ready to execute. Awaiting task assignments.
```

### 2. Spawn Agents (in separate terminals)

```bash
# Terminal 2
bun cli.ts spawn-agent codex-dev

# Terminal 3
bun cli.ts spawn-agent sr-designer

# Terminal 4
bun cli.ts spawn-agent sr-architect

# Terminal 5
bun cli.ts spawn-agent qa-auditor
```

Each agent will:
```
🚀 Agent: codex-dev
Connecting to: ws://localhost:9999?agent=codex-dev
[codex-dev] Connected to orchestrator
```

### 3. Add Tasks

```bash
bun cli.ts add-task "Implement Convex backend"
bun cli.ts add-task "Build web UI components"
bun cli.ts add-task "Deploy to Vercel"
```

Or load pre-defined Mission Control Phase 1 tasks:

```bash
bun cli.ts load-mission-control
```

### 4. Monitor Progress

```bash
bun cli.ts status
```

Output:
```
📊 Agent OS Status

Tasks:
  ⏳ Pending: 3
  🔄 Running: 1
  ✅ Completed: 2
  ❌ Failed: 0

Recent Tasks:
  🔄 Implement Convex backend (a1b2c3d4)
  ✅ Deploy to Vercel (e5f6g7h8)
  ⏳ Run smoke tests (i9j0k1l2)
```

## Task Format

Tasks are JSON objects with:

```typescript
{
  id: string;                                    // Auto-generated
  type: 'code' | 'design' | 'architecture' | 'test' | 'deploy' | 'docs';
  title: string;                                 // Display name
  description: string;                           // Shell commands to execute
  deadline: Date;                                // When task must complete
  priority: 'critical' | 'high' | 'medium' | 'low';
  assignee: string;                              // Agent name or 'auto'
  status: 'pending' | 'running' | 'completed' | 'failed' | 'blocked';
}
```

Example task:

```json
{
  "id": "task-1",
  "type": "code",
  "title": "Implement Convex backend",
  "description": "cd ~/Projects/hurley-mission-control && convex deploy",
  "priority": "critical",
  "assignee": "codex-dev"
}
```

## Agent Execution Flow

1. **Orchestrator sends task:** `{ type: 'task_dispatch', task: {...}, sessionId: '...' }`
2. **Agent receives task:** Stores sessionId, taskId, starts transcript logging
3. **Agent spawns zsh:** `zsh -i -c "source ~/.zshrc && <task.description>"`
4. **Agent streams output:** Every stdout/stderr line sent back via WebSocket
5. **Agent handles completion:**
   - Detects git repo
   - Prompts to commit (interactive zsh)
   - Auto-pushes changes
   - Sends `task_complete` message
6. **Transcript saved:** Full session log to `~/.hurleyus/agent-os/sessions/<sessionId>.log`
7. **Orchestrator marks done:** Task status → completed, offers next task to agent

## OpenClaw Integration (Future)

Currently Agent OS runs standalone on localhost:9999. Future enhancement:

```bash
# Orchestrator reports to DHH (OpenClaw)
ws://192.168.1.134:18789?token=$GATEWAY_TOKEN
```

I (DHH) can then:
- Watch agents execute in real-time
- Interrupt/steer tasks
- Report progress back to you (Michael)

## File Structure

```
agent-os/
├── orchestrator.ts        # Ink UI + WebSocket server + task queue
├── agent-client.ts        # Agent runner (connects via WS, spawns zsh)
├── agent-runner.sh        # Bash version (optional fallback)
├── cli.ts                 # CLI for managing orchestrator + tasks
├── package.json           # Dependencies
└── README.md              # This file

~/.hurleyus/agent-os/
├── state.json             # Task queue + logs
└── sessions/
    ├── <sessionId1>.log   # Full transcript from task 1
    ├── <sessionId2>.log   # Full transcript from task 2
    └── ...
```

## Dependencies

```json
{
  "ink": "^4.4.1",          // Terminal UI (React)
  "react": "^18.2.0",       // For Ink components
  "ws": "^8.15.0",          // WebSocket server/client
  "nanoid": "^4.0.2"        // Task ID generation
}
```

Install:

```bash
cd ~/.openclaw/workspace/agent-os
bun install
```

## Example Workflow: Mission Control Phase 1

```bash
# Terminal 1: Start orchestrator
bun cli.ts run-orchestrator

# Terminal 2: Spawn agents
bun cli.ts spawn-agent codex-dev
bun cli.ts spawn-agent sr-designer
bun cli.ts spawn-agent sr-architect
bun cli.ts spawn-agent qa-auditor

# Terminal 3: Load tasks
bun cli.ts load-mission-control

# Terminal 3: Monitor progress
watch 'bun cli.ts status'
```

Watch real-time:
- Orchestrator UI shows tasks moving from pending → running → completed
- Each agent's transcript logged as they execute
- Final status report shows all Phase 1 tasks shipped

## Debugging

### View session transcript

```bash
cat ~/.hurleyus/agent-os/sessions/<sessionId>.log
```

### Check agent connection

```bash
tail -f ~/.hurleyus/agent-os/state.json
```

### Agent logs

View agent process output in its terminal (each spawned in separate shell)

## Architecture Decisions

1. **WebSocket over HTTP** — Real-time bidirectional comms, essential for streaming
2. **Interactive zsh shells** — Not sandboxed subprocess; agents have full shell context
3. **JSON state, not database** — Simple, human-readable, survives restarts
4. **Ink for UI** — React components, familiar to our team
5. **Native git integration** — Agents handle commits/pushes themselves
6. **Session transcripts** — Full debugging trail, no surprises

## Future Enhancements

- [ ] Dashboard web UI (browser-based monitor)
- [ ] Multi-machine agent support (different hosts)
- [ ] Task dependencies (run after task X completes)
- [ ] Agent performance metrics (velocity, accuracy)
- [ ] Slack/Discord notifications
- [ ] OpenClaw relay integration (I observe + report to you)

## License

Internal to HurleyUS. See your contract for terms.

---

**Built for shipping. No frameworks. Just tasks, agents, and shells.**
