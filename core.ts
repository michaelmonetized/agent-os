/**
 * HurleyUS Agent OS — Autonomous task orchestration for tight deadlines
 * 
 * Design:
 * - Task queue (pull-based, not cron)
 * - Agent pools (parallel execution)
 * - Deadline tracking (fail fast)
 * - Real-time reporting
 * - Multi-provider support
 */

import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";

// Load .env (MUST happen first!)
function loadEnv() {
  const envFile = path.join(import.meta.dir, ".env");
  if (fs.existsSync(envFile)) {
    const envContent = fs.readFileSync(envFile, "utf-8");
    envContent.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...valueParts] = trimmed.split("=");
        const value = valueParts.join("=");
        if (key && value) {
          process.env[key.trim()] = value.trim();
        }
      }
    });
  }
}

loadEnv();

// Verify API key is loaded
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("❌ ANTHROPIC_API_KEY not set. Check .env file.");
  process.exit(1);
}

// Types
interface Task {
  id: string;
  type: "code" | "design" | "architecture" | "test" | "deploy" | "docs";
  title: string;
  description: string;
  deadline: Date;
  priority: "critical" | "high" | "medium" | "low";
  assignee: string;
  dependencies: string[];
  status: "pending" | "running" | "completed" | "failed" | "blocked";
  result?: string;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

interface Agent {
  id: string;
  name: string;
  persona: string;
  types: Task["type"][];
  model: string;
  busy: boolean;
  currentTask?: string;
}

interface ProjectState {
  name: string;
  deadline: Date;
  tasks: Task[];
  agents: Agent[];
  progress: number;
  updatedAt: Date;
}

// Global State
let projectState: ProjectState = {
  name: "Mission Control",
  deadline: new Date("2026-03-19T22:00:00-04:00"), // EOD
  tasks: [],
  agents: [
    {
      id: "codex-dev",
      name: "Codex Dev",
      persona: "Full-stack TypeScript engineer. Pragmatic. Hates meetings. Ships fast.",
      types: ["code", "deploy"],
      model: "claude-opus-4-6",
      busy: false,
    },
    {
      id: "sr-designer",
      name: "SR Designer",
      persona: "Pixel-perfect. Frontend-first. Motion junkie.",
      types: ["design", "code"],
      model: "claude-opus-4-6",
      busy: false,
    },
    {
      id: "sr-architect",
      name: "SR Architect",
      persona: "Systems thinker. Reviews before code. Opinionated.",
      types: ["architecture", "code"],
      model: "claude-opus-4-6",
      busy: false,
    },
    {
      id: "qa-auditor",
      name: "QA Auditor",
      persona: "Paranoid tester. Catches edge cases.",
      types: ["test"],
      model: "claude-opus-4-6",
      busy: false,
    },
  ],
  progress: 0,
  updatedAt: new Date(),
};

// Initialize Anthropic
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Core Functions
async function executeTask(task: Task, agent: Agent): Promise<void> {
  console.log(`\n🚀 Agent ${agent.name} starting: ${task.title}`);

  const agent_obj = projectState.agents.find((a) => a.id === agent.id);
  if (agent_obj) {
    agent_obj.busy = true;
    agent_obj.currentTask = task.id;
  }

  task.status = "running";
  task.startedAt = new Date();

  const prompt = `You are ${agent.name}. ${agent.persona}

Task: ${task.title}
Description: ${task.description}
Deadline: ${task.deadline.toISOString()}

Deliver concrete results. No fluff. Output must be actionable code, design, or analysis.`;

  try {
    const message = await anthropic.messages.create({
      model: agent.model,
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const result =
      message.content[0].type === "text" ? message.content[0].text : "";

    task.result = result;
    task.status = "completed";
    task.completedAt = new Date();

    console.log(`✅ ${agent.name} completed: ${task.title}`);
  } catch (error) {
    task.status = "failed";
    task.error = (error as Error).message;
    task.completedAt = new Date();

    console.error(`❌ ${agent.name} failed: ${task.title}`);
    console.error(error);
  } finally {
    if (agent_obj) {
      agent_obj.busy = false;
      agent_obj.currentTask = undefined;
    }
  }

  saveState();
}

function getNextTask(): Task | undefined {
  // Priority: critical > deadline soon > dependencies met > ready
  const now = new Date();
  const deadlineBuffer = 30 * 60 * 1000; // 30 min buffer

  const eligible = projectState.tasks.filter((t) => {
    if (t.status !== "pending") return false;
    if (t.dependencies.length > 0) {
      const depsReady = t.dependencies.every((dep) => {
        const depTask = projectState.tasks.find((d) => d.id === dep);
        return depTask?.status === "completed";
      });
      if (!depsReady) return false;
    }
    return true;
  });

  return eligible.sort((a, b) => {
    // Sort by: critical > time until deadline
    if (a.priority === "critical" && b.priority !== "critical") return -1;
    if (a.priority !== "critical" && b.priority === "critical") return 1;
    return a.deadline.getTime() - b.deadline.getTime();
  })[0];
}

function getAvailableAgent(taskType: Task["type"]): Agent | undefined {
  return projectState.agents.find((a) => a.types.includes(taskType) && !a.busy);
}

async function processQueue(): Promise<void> {
  console.log("\n📋 Processing task queue...");

  while (true) {
    const task = getNextTask();
    if (!task) {
      console.log("✅ No more tasks in queue");
      break;
    }

    const agent = getAvailableAgent(task.type);
    if (!agent) {
      console.log(`⏳ No available agent for ${task.type}. Waiting...`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
      continue;
    }

    await executeTask(task, agent);
  }
}

function saveState(): void {
  const stateFile = path.join(
    process.env.HOME || "/tmp",
    ".hurleyus",
    "agent-os-state.json"
  );
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(projectState, null, 2));
}

function loadState(): void {
  const stateFile = path.join(
    process.env.HOME || "/tmp",
    ".hurleyus",
    "agent-os-state.json"
  );
  if (fs.existsSync(stateFile)) {
    const data = JSON.parse(fs.readFileSync(stateFile, "utf-8"));
    projectState = {
      ...projectState,
      ...data,
      deadline: new Date(data.deadline),
      tasks: data.tasks.map((t: any) => ({
        ...t,
        deadline: new Date(t.deadline),
        startedAt: t.startedAt ? new Date(t.startedAt) : undefined,
        completedAt: t.completedAt ? new Date(t.completedAt) : undefined,
      })),
    };
  }
}

function addTask(task: Omit<Task, "status" | "id">): Task {
  const newTask: Task = {
    ...task,
    id: `task-${Date.now()}`,
    status: "pending",
  };
  projectState.tasks.push(newTask);
  saveState();
  return newTask;
}

function getStatus(): void {
  const completed = projectState.tasks.filter(
    (t) => t.status === "completed"
  ).length;
  const total = projectState.tasks.length;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  console.log("\n📊 PROJECT STATUS");
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Project: ${projectState.name}`);
  console.log(`Deadline: ${projectState.deadline.toLocaleString()}`);
  console.log(`Progress: ${completed}/${total} (${progress}%)`);
  console.log(`\nTasks:`);

  projectState.tasks.forEach((t) => {
    const icon =
      t.status === "completed"
        ? "✅"
        : t.status === "running"
          ? "🚀"
          : t.status === "failed"
            ? "❌"
            : t.status === "blocked"
              ? "⏳"
              : "⭕";
    console.log(`  ${icon} [${t.type}] ${t.title} (${t.priority})`);
    if (t.error) console.log(`     Error: ${t.error}`);
  });

  console.log(`\nAgents:`);
  projectState.agents.forEach((a) => {
    const status = a.busy ? `🚀 Running: ${a.currentTask}` : "✅ Available";
    console.log(`  ${a.name}: ${status}`);
  });
}

// Export
export { addTask, getStatus, processQueue, loadState, saveState };
