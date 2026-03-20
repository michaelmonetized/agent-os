/**
 * Mission Control - Task Definitions
 * Phase 1: Web App (EOD)
 * Phase 2: Electron (After Phase 1)
 * Phase 3: iOS (After Phase 2)
 */

import { addTask } from "./core";

export function defineMissionControlTasks() {
  const eod = new Date();
  eod.setHours(22, 0, 0, 0); // 10 PM EDT

  // PHASE 1: WEB APP
  console.log("📋 Defining Mission Control Phase 1 tasks...\n");

  const convexBackend = addTask({
    type: "code",
    title: "Convex Backend - Queries & Mutations",
    description: `Deploy Convex schema. Implement:
- Queries: getThreads, getMessages, getThreadMembers
- Mutations: sendMessage (with clientMessageId), createThread, addUserToThread, markDelivered
- Schema: users, threads, messages, deliveries, presence
Location: hurley-mission-control/convex/

Repo: https://github.com/michaelmonetized/hurley-mission-control`,
    deadline: new Date(Date.now() + 90 * 60 * 1000), // 90 min
    priority: "critical",
    assignee: "codex-dev",
    dependencies: [],
  });

  const webLayout = addTask({
    type: "design",
    title: "Web UI - Layout & Components",
    description: `Create:
- apps/web/app/layout.tsx (global header + sidebar)
- apps/web/components/ThreadList.tsx (with useQuery)
- apps/web/components/MessageList.tsx (messages + timestamps)
- apps/web/components/MessageInput.tsx (textarea + send button)
- apps/web/app/threads/[id]/page.tsx (assemble together)

Use: Tailwind 4 + shadcn/ui
Location: hurley-mission-control/apps/web/`,
    deadline: new Date(Date.now() + 120 * 60 * 1000), // 120 min
    priority: "critical",
    assignee: "sr-designer",
    dependencies: [],
  });

  const archReview = addTask({
    type: "architecture",
    title: "Architecture Review - Phase 1 Approval",
    description: `Approve and document:
- Tech stack: Convex (DB), Clerk (auth), polling for real-time ✓
- Data flow: Web UI → Convex mutations → message broadcast
- Idempotency: clientMessageId strategy ✓
- Deployment: Next.js on Vercel

Output: 1-page architecture doc for team reference`,
    deadline: new Date(Date.now() + 60 * 60 * 1000), // 60 min
    priority: "critical",
    assignee: "sr-architect",
    dependencies: [],
  });

  const messageSending = addTask({
    type: "code",
    title: "Message Sending - Wire Frontend to Backend",
    description: `Implement in apps/web/:
- useMutation hook for sendMessage
- Optimistic UI (add to state immediately)
- Handle clientMessageId for idempotency (uuid v4)
- Error handling + retry logic
- Integration test: send message → see it appear

Depends on: Convex mutations working`,
    deadline: new Date(Date.now() + 140 * 60 * 1000), // 140 min
    priority: "critical",
    assignee: "codex-dev",
    dependencies: [convexBackend.id],
  });

  const realTime = addTask({
    type: "code",
    title: "Real-Time Subscription - Message Polling",
    description: `Implement in apps/web/:
- useEffect to re-fetch messages every 2 seconds
- Loading state + refresh indicator
- Better: Implement Convex useSubscription if available

Polling is sufficient for MVP.`,
    deadline: new Date(Date.now() + 150 * 60 * 1000), // 150 min
    priority: "high",
    assignee: "codex-dev",
    dependencies: [messageSending.id],
  });

  const vercelDeploy = addTask({
    type: "deploy",
    title: "Deploy to Vercel - Web App Live",
    description: `Deploy apps/web to production:
1. Set env vars: CONVEX_DEPLOYMENT, CLERK_SECRET_KEY
2. vercel deploy --prod
3. Verify URL works
4. Smoke test: sign in → create thread → send message

Target: https://hurleyus-mission-control.vercel.app`,
    deadline: eod,
    priority: "critical",
    assignee: "codex-dev",
    dependencies: [webLayout.id, messageSending.id, archReview.id],
  });

  const smokeTest = addTask({
    type: "test",
    title: "QA - Smoke Test Phase 1",
    description: `Test deployed web app:
1. Sign in with Clerk
2. Create a thread
3. Send a message
4. Verify message appears (real-time polling works)
5. Check for errors/crashes
6. Performance check: <2s latency

Document results.`,
    deadline: eod,
    priority: "critical",
    assignee: "qa-auditor",
    dependencies: [vercelDeploy.id],
  });

  console.log(`✅ Defined ${7} Phase 1 tasks`);
  console.log(`   - 4 blocking (critical path)`);
  console.log(`   - Deadline: EOD 2026-03-19 (22:00 EDT)\n`);

  return {
    convexBackend,
    webLayout,
    archReview,
    messageSending,
    realTime,
    vercelDeploy,
    smokeTest,
  };
}
