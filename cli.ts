#!/usr/bin/env bun
/**
 * Agent OS CLI - Manage tasks, agents, and orchestrator
 * 
 * Usage:
 *   bun cli.ts status              - Show current state
 *   bun cli.ts add-task <title>    - Add new task
 *   bun cli.ts run-orchestrator    - Start the orchestrator
 *   bun cli.ts spawn-agent <name>  - Spawn an agent
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn, execSync } from 'child_process';

const STATE_DIR = path.join(process.env.HOME!, '.hurleyus', 'agent-os');
const STATE_FILE = path.join(STATE_DIR, 'state.json');

function ensureStateDir() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

function loadState() {
  if (fs.existsSync(STATE_FILE)) {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  }
  return { tasks: [], logs: [] };
}

function saveState(state: any) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function showStatus() {
  ensureStateDir();
  const state = loadState();
  
  console.log('\n📊 Agent OS Status\n');
  console.log(`Tasks:`);
  console.log(`  ⏳ Pending: ${state.tasks.filter((t: any) => t.status === 'pending').length}`);
  console.log(`  🔄 Running: ${state.tasks.filter((t: any) => t.status === 'running').length}`);
  console.log(`  ✅ Completed: ${state.tasks.filter((t: any) => t.status === 'completed').length}`);
  console.log(`  ❌ Failed: ${state.tasks.filter((t: any) => t.status === 'failed').length}`);
  
  console.log(`\nRecent Tasks:`);
  state.tasks.slice(-5).forEach((task: any) => {
    const status = {
      pending: '⏳',
      running: '🔄',
      completed: '✅',
      failed: '❌'
    }[task.status];
    console.log(`  ${status} ${task.title} (${task.id.slice(0, 8)})`);
  });
  
  console.log(`\nRecent Logs:`);
  state.logs.slice(-3).forEach((log: string) => {
    console.log(`  ${log.slice(0, 80)}`);
  });
  console.log('');
}

function addTask(title: string) {
  ensureStateDir();
  const state = loadState();
  
  const task = {
    id: Math.random().toString(36).slice(2, 10),
    title,
    description: `Execute: ${title}`,
    type: 'code',
    priority: 'high',
    assignee: 'auto',
    status: 'pending',
    deadline: new Date(Date.now() + 3600000).toISOString(),
  };
  
  state.tasks.push(task);
  state.logs.push(`[${new Date().toISOString()}] Task added: ${title}`);
  saveState(state);
  
  console.log(`✅ Task added: ${title} (${task.id})`);
}

function runOrchestrator() {
  console.log('🚀 Starting Agent OS Orchestrator...');
  console.log('Listening on ws://localhost:9999\n');
  
  // Run orchestrator in this process
  execSync('bun run orchestrator.ts', { cwd: __dirname, stdio: 'inherit' });
}

function spawnAgent(name: string) {
  console.log(`🤖 Spawning agent: ${name}`);
  
  // Spawn agent as separate process
  const agent = spawn('bun', ['run', 'agent-client.ts', name, 'ws://localhost:9999'], {
    cwd: __dirname,
    stdio: 'inherit',
  });
  
  agent.on('exit', (code) => {
    console.log(`Agent ${name} exited with code ${code}`);
  });
}

function loadMissionControlTasks() {
  ensureStateDir();
  const state = loadState();
  
  const tasks = [
    {
      id: 'mc-convex',
      title: 'Deploy Convex Backend',
      description: 'cd ~/Projects/hurley-mission-control && convex deploy',
      type: 'deploy',
      priority: 'critical',
    },
    {
      id: 'mc-web',
      title: 'Build Web App',
      description: 'cd ~/Projects/hurley-mission-control/apps/web && bun run build',
      type: 'code',
      priority: 'critical',
    },
    {
      id: 'mc-vercel',
      title: 'Deploy to Vercel',
      description: 'cd ~/Projects/hurley-mission-control && vercel deploy --prod',
      type: 'deploy',
      priority: 'critical',
    },
    {
      id: 'mc-test',
      title: 'Smoke Test',
      description: 'echo "Testing live deployment..." && curl https://hurley-mission-control.vercel.app',
      type: 'test',
      priority: 'high',
    },
  ];
  
  state.tasks = [...state.tasks.filter((t: any) => !t.id.startsWith('mc-')), ...tasks];
  state.logs.push(`[${new Date().toISOString()}] Loaded Mission Control tasks`);
  saveState(state);
  
  console.log('✅ Loaded Mission Control Phase 1 tasks');
  tasks.forEach(t => console.log(`  - ${t.title}`));
}

// Main CLI
const command = process.argv[2];

switch (command) {
  case 'status':
    showStatus();
    break;
  case 'add-task':
    addTask(process.argv[3] || 'Untitled Task');
    break;
  case 'run-orchestrator':
    runOrchestrator();
    break;
  case 'spawn-agent':
    spawnAgent(process.argv[3] || 'agent-1');
    break;
  case 'load-mission-control':
    loadMissionControlTasks();
    break;
  case 'help':
  default:
    console.log(`
HurleyUS Agent OS CLI

Usage:
  bun cli.ts status                  - Show current state
  bun cli.ts add-task <title>        - Add new task
  bun cli.ts run-orchestrator        - Start the orchestrator
  bun cli.ts spawn-agent <name>      - Spawn an agent
  bun cli.ts load-mission-control    - Load Phase 1 tasks
  bun cli.ts help                    - Show this help

Example workflow:
  1. bun cli.ts run-orchestrator          # Start in one terminal
  2. bun cli.ts spawn-agent codex-dev     # Start in another terminal
  3. bun cli.ts load-mission-control      # Load tasks
  4. bun cli.ts status                    # Check progress
    `);
}
