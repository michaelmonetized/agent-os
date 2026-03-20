#!/usr/bin/env bun
/**
 * HurleyUS Agent OS - Live Interactive Orchestrator
 * 
 * - WebSocket server (agents connect here)
 * - Ink terminal UI (task queue, agent status, live logs)
 * - Full session transcripts + state persistence
 * - OpenClaw integration (report back to DHH on ws://192.168.1.134:18789)
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { render } from 'ink';
import { WebSocketServer } from 'ws';
import { nanoid } from 'nanoid';
import * as fs from 'fs';
import * as path from 'path';

// Types
interface Task {
  id: string;
  type: 'code' | 'design' | 'architecture' | 'test' | 'deploy' | 'docs';
  title: string;
  description: string;
  deadline: Date;
  priority: 'critical' | 'high' | 'medium' | 'low';
  assignee: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'blocked';
  result?: string;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

interface Agent {
  id: string;
  name: string;
  ws?: any;
  busy: boolean;
  currentTask?: string;
  lastSeen: Date;
}

interface AgentSession {
  id: string;
  agentName: string;
  taskId: string;
  startedAt: Date;
  endedAt?: Date;
  transcript: string[];
  status: 'running' | 'completed' | 'failed';
}

// Global state
const STATE_DIR = path.join(process.env.HOME!, '.hurleyus', 'agent-os');
const SESSIONS_DIR = path.join(STATE_DIR, 'sessions');
const STATE_FILE = path.join(STATE_DIR, 'state.json');

// Ensure directories exist
fs.mkdirSync(STATE_DIR, { recursive: true });
fs.mkdirSync(SESSIONS_DIR, { recursive: true });

let taskQueue: Task[] = [];
let agents: Map<string, Agent> = new Map();
let activeSessions: Map<string, AgentSession> = new Map();
let logs: string[] = [];

const PORT = 9999;
const OPENCLAW_WS = process.env.OPENCLAW_GATEWAY || 'ws://192.168.1.134:18789';

// Load state on startup
function loadState() {
  if (fs.existsSync(STATE_FILE)) {
    const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    taskQueue = data.tasks || [];
    logs = data.logs || [];
  }
}

// Save state
function saveState() {
  fs.writeFileSync(STATE_FILE, JSON.stringify({
    tasks: taskQueue,
    logs,
    timestamp: new Date().toISOString(),
  }, null, 2));
}

// Add log entry
function addLog(message: string) {
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] ${message}`;
  logs.push(entry);
  console.error(entry); // stderr for live feedback
}

// Session transcript
function logToSession(sessionId: string, message: string) {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.transcript.push(`[${new Date().toISOString()}] ${message}`);
  }
}

// Task queue management
function addTask(task: Omit<Task, 'id' | 'status'>) {
  const id = nanoid();
  taskQueue.push({
    ...task,
    id,
    status: 'pending',
  });
  addLog(`Task added: ${task.title} (${id.slice(0, 8)})`);
  return id;
}

function getNextTask(): Task | undefined {
  return taskQueue.find(t => t.status === 'pending');
}

function updateTaskStatus(taskId: string, status: Task['status'], result?: string) {
  const task = taskQueue.find(t => t.id === taskId);
  if (task) {
    task.status = status;
    if (result) task.result = result;
    if (status === 'running') task.startedAt = new Date();
    if (status === 'completed' || status === 'failed') task.completedAt = new Date();
  }
  saveState();
}

// Ink UI Components
const TaskQueueView: React.FC<{ tasks: Task[] }> = ({ tasks }) => {
  const pending = tasks.filter(t => t.status === 'pending').length;
  const running = tasks.filter(t => t.status === 'running').length;
  const completed = tasks.filter(t => t.status === 'completed').length;
  const failed = tasks.filter(t => t.status === 'failed').length;

  return (
    <div>
      <div style={{ color: 'cyan' }}>📋 Task Queue</div>
      <div>  ⏳ Pending: {pending} | 🔄 Running: {running} | ✅ Completed: {completed} | ❌ Failed: {failed}</div>
      {tasks.filter(t => t.status === 'pending' || t.status === 'running').slice(0, 3).map(task => (
        <div key={task.id} style={{ color: task.status === 'running' ? 'yellow' : 'gray' }}>
          {task.status === 'running' ? '▶ ' : '  '}{task.title.slice(0, 40)}
        </div>
      ))}
    </div>
  );
};

const AgentPoolView: React.FC<{ agents: Map<string, Agent> }> = ({ agents }) => {
  return (
    <div>
      <div style={{ color: 'magenta' }}>👥 Agent Pool</div>
      {Array.from(agents.values()).map(agent => (
        <div key={agent.id} style={{ color: agent.busy ? 'green' : 'gray' }}>
          {agent.busy ? '● ' : '○ '}{agent.name} {agent.currentTask ? `(${agent.currentTask.slice(0, 20)})` : ''}
        </div>
      ))}
    </div>
  );
};

const LogViewerView: React.FC<{ logs: string[] }> = ({ logs }) => {
  const recentLogs = logs.slice(-5);
  return (
    <div>
      <div style={{ color: 'white' }}>📜 Recent Logs</div>
      {recentLogs.map((log, i) => (
        <div key={i} style={{ fontSize: 'small', color: 'gray' }}>
          {log.slice(0, 80)}
        </div>
      ))}
    </div>
  );
};

const OrchestratorUI: React.FC = () => {
  const [state, setState] = useState({ taskQueue, agents, logs });

  useEffect(() => {
    const interval = setInterval(() => {
      setState({ taskQueue, agents, logs });
    }, 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ padding: 1 }}>
      <div style={{ color: 'blue', fontWeight: 'bold' }}>🚀 HurleyUS Agent OS</div>
      <div style={{ color: 'gray' }}>ws://localhost:{PORT} | OpenClaw: {OPENCLAW_WS}</div>
      <div />
      <TaskQueueView tasks={state.taskQueue} />
      <div />
      <AgentPoolView agents={state.agents} />
      <div />
      <LogViewerView logs={state.logs} />
      <div />
      <div style={{ color: 'green' }}>Ready to execute. Awaiting task assignments.</div>
    </div>
  );
};

// WebSocket Server
function startWebSocketServer() {
  const wss = new WebSocketServer({ port: PORT });

  wss.on('connection', (ws, req) => {
    const agentId = nanoid();
    const agentName = req.url?.split('=')[1] || `agent-${agentId.slice(0, 4)}`;

    const agent: Agent = {
      id: agentId,
      name: agentName,
      ws,
      busy: false,
      lastSeen: new Date(),
    };

    agents.set(agentId, agent);
    addLog(`Agent connected: ${agentName} (${agentId.slice(0, 8)})`);

    // Handle messages from agent
    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case 'task_start':
          agent.busy = true;
          agent.currentTask = message.taskId;
          updateTaskStatus(message.taskId, 'running');
          addLog(`Agent ${agentName} started task ${message.taskId.slice(0, 8)}`);
          break;

        case 'task_output':
          logToSession(message.sessionId, message.output);
          break;

        case 'task_complete':
          agent.busy = false;
          agent.currentTask = undefined;
          updateTaskStatus(message.taskId, 'completed', message.result);
          addLog(`Agent ${agentName} completed task ${message.taskId.slice(0, 8)}`);
          
          // Save session transcript
          const session = activeSessions.get(message.sessionId);
          if (session) {
            session.status = 'completed';
            session.endedAt = new Date();
            const transcriptPath = path.join(SESSIONS_DIR, `${session.id}.log`);
            fs.writeFileSync(transcriptPath, session.transcript.join('\n'));
          }

          // Dispatch next task if available
          const nextTask = getNextTask();
          if (nextTask) {
            dispatchTask(agentId, nextTask);
          }
          break;

        case 'task_failed':
          agent.busy = false;
          agent.currentTask = undefined;
          updateTaskStatus(message.taskId, 'failed', message.error);
          addLog(`❌ Agent ${agentName} failed: ${message.error}`);
          break;
      }
    });

    ws.on('close', () => {
      agents.delete(agentId);
      addLog(`Agent disconnected: ${agentName}`);
    });

    // Offer next available task
    const nextTask = getNextTask();
    if (nextTask) {
      dispatchTask(agentId, nextTask);
    }
  });

  addLog(`WebSocket server listening on ws://localhost:${PORT}`);
}

// Dispatch task to agent
function dispatchTask(agentId: string, task: Task) {
  const agent = agents.get(agentId);
  if (!agent || !agent.ws) return;

  const sessionId = nanoid();
  const session: AgentSession = {
    id: sessionId,
    agentName: agent.name,
    taskId: task.id,
    startedAt: new Date(),
    transcript: [`Task: ${task.title}`, `Description: ${task.description}`, ''],
    status: 'running',
  };
  activeSessions.set(sessionId, session);

  agent.ws.send(JSON.stringify({
    type: 'task_dispatch',
    task,
    sessionId,
  }));
}

// OpenClaw Integration (optional future enhancement)
// function reportToOpenClaw(message: string) { ... }

// Load state and start
loadState();
startWebSocketServer();

// Render Ink UI
render(<OrchestratorUI />);

addLog('Agent OS ready. Awaiting agent connections and task assignments.');

// Keep process alive
process.on('SIGINT', () => {
  saveState();
  addLog('Agent OS shutting down gracefully.');
  process.exit(0);
});
