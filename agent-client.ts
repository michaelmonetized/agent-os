#!/usr/bin/env bun
/**
 * Agent Client - Connects to orchestrator via WebSocket
 * Spawns interactive zsh shell for task execution
 * Streams output back to orchestrator
 */

import { WebSocket } from 'ws';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { nanoid } from 'nanoid';

const AGENT_NAME = process.argv[2] || `agent-${nanoid(4)}`;
const ORCHESTRATOR_URL = process.argv[3] || 'ws://localhost:9999';

const SESSION_DIR = path.join(process.env.HOME!, '.hurleyus', 'agent-os', 'sessions');
fs.mkdirSync(SESSION_DIR, { recursive: true });

interface TaskMessage {
  type: 'task_dispatch';
  task: {
    id: string;
    title: string;
    description: string;
    type: string;
  };
  sessionId: string;
}

let currentSessionId = '';
let currentTaskId = '';
let ws: WebSocket;

function connect() {
  ws = new WebSocket(`${ORCHESTRATOR_URL}?agent=${AGENT_NAME}`);

  ws.on('open', () => {
    console.log(`[${AGENT_NAME}] Connected to orchestrator`);
  });

  ws.on('message', (data) => {
    const message: TaskMessage = JSON.parse(data.toString());

    if (message.type === 'task_dispatch') {
      currentSessionId = message.sessionId;
      currentTaskId = message.task.id;
      executeTask(message.task);
    }
  });

  ws.on('error', (err) => {
    console.error(`[${AGENT_NAME}] WebSocket error:`, err);
  });

  ws.on('close', () => {
    console.log(`[${AGENT_NAME}] Disconnected. Reconnecting in 5s...`);
    setTimeout(connect, 5000);
  });
}

async function executeTask(task: any) {
  console.log(`[${AGENT_NAME}] Executing: ${task.title}`);
  
  const transcript: string[] = [
    `Task: ${task.title}`,
    `Description: ${task.description}`,
    `Started: ${new Date().toISOString()}`,
    '',
  ];

  // Spawn interactive zsh shell
  const shell = spawn('zsh', ['-i', '-c', buildShellCommand(task.description)], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      AGENT_NAME,
      TASK_ID: currentTaskId,
      SESSION_ID: currentSessionId,
    },
  });

  let stdout = '';
  let stderr = '';

  shell.stdout.on('data', (data) => {
    const text = data.toString();
    stdout += text;
    transcript.push(text.trim());
    
    // Stream to orchestrator in real-time
    sendMessage('task_output', {
      output: text,
      sessionId: currentSessionId,
    });
  });

  shell.stderr.on('data', (data) => {
    const text = data.toString();
    stderr += text;
    transcript.push(`ERROR: ${text.trim()}`);
    
    sendMessage('task_output', {
      output: `[ERROR] ${text}`,
      sessionId: currentSessionId,
    });
  });

  shell.on('close', (code) => {
    transcript.push(`Completed: ${new Date().toISOString()}`);
    transcript.push(`Exit code: ${code}`);

    // Save transcript
    const transcriptPath = path.join(SESSION_DIR, `${currentSessionId}.log`);
    fs.writeFileSync(transcriptPath, transcript.join('\n'));

    // Report result to orchestrator
    if (code === 0) {
      sendMessage('task_complete', {
        taskId: currentTaskId,
        sessionId: currentSessionId,
        result: stdout,
      });
      console.log(`[${AGENT_NAME}] Task completed successfully`);
    } else {
      sendMessage('task_failed', {
        taskId: currentTaskId,
        sessionId: currentSessionId,
        error: `Exited with code ${code}: ${stderr || stdout}`,
      });
      console.log(`[${AGENT_NAME}] Task failed with exit code ${code}`);
    }
  });
}

function buildShellCommand(description: string): string {
  return `
    source ~/.zshrc
    export AGENT_NAME='${AGENT_NAME}'
    export TASK_ID='${currentTaskId}'
    export SESSION_ID='${currentSessionId}'
    
    # Load HurleyUS context if available
    [ -f ~/.hurleyus/GOALS ] && source ~/.hurleyus/GOALS
    [ -f ~/.hurleyus/TASKS ] && source ~/.hurleyus/TASKS
    
    # Execute task
    ${description}
    
    # Auto-commit if in a git repo
    if git rev-parse --git-dir > /dev/null 2>&1; then
      echo ''
      echo 'Auto-committing changes...'
      git add -A 2>/dev/null || true
      if ! git diff --cached --quiet 2>/dev/null; then
        git commit -m "[${AGENT_NAME}] ${currentTaskId}" 2>/dev/null || true
        git push origin HEAD 2>/dev/null || true
      fi
    fi
  `;
}

function sendMessage(type: string, payload: any) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type,
      ...payload,
    }));
  }
}

// Start agent
connect();

// Keep alive
setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.ping();
  }
}, 30000);
