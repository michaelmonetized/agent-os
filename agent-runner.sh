#!/bin/bash

###############################################################################
# HurleyUS Agent OS - Agent Runner
#
# Usage: agent-runner.sh [agent-name] [orchestrator-port]
# Example: agent-runner.sh codex-dev 9999
#
# This script:
# 1. Connects to the orchestrator via WebSocket
# 2. Receives task assignments
# 3. Executes tasks in an interactive zsh shell (with full ~/.zshrc context)
# 4. Streams output back to orchestrator
# 5. Handles task completion / failure
###############################################################################

set -euo pipefail

AGENT_NAME="${1:-agent-$(uuidgen | cut -d- -f1)}"
ORCHESTRATOR_PORT="${2:-9999}"
ORCHESTRATOR_URL="ws://localhost:${ORCHESTRATOR_PORT}?agent=${AGENT_NAME}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🚀 Agent: ${AGENT_NAME}${NC}"
echo -e "${BLUE}Connecting to: ${ORCHESTRATOR_URL}${NC}"

# Session variables
SESSION_ID=""
TASK_ID=""
TEMP_DIR="/tmp/agent-os-${AGENT_NAME}"
mkdir -p "${TEMP_DIR}"

# Function: Send message to orchestrator
send_message() {
  local type="$1"
  local payload="$2"
  
  # In a real implementation, this would pipe to the WebSocket connection
  # For now, we'll use a simple HTTP/ws fallback or file-based queue
  echo "{\"type\": \"${type}\", \"sessionId\": \"${SESSION_ID}\", \"taskId\": \"${TASK_ID}\", ${payload}}" >> "${TEMP_DIR}/outbox.json"
}

# Function: Execute task in interactive shell
execute_task() {
  local task_title="$1"
  local task_description="$2"
  
  echo -e "${YELLOW}📋 Task: ${task_title}${NC}"
  echo -e "${YELLOW}Description: ${task_description}${NC}"
  echo ""
  
  # Start interactive zsh shell with full context
  zsh -i -c "
    source ~/.zshrc
    
    # Export task context
    export AGENT_NAME='${AGENT_NAME}'
    export TASK_ID='${TASK_ID}'
    export SESSION_ID='${SESSION_ID}'
    
    # Show context
    echo '${GREEN}=== Agent Context ===${NC}'
    echo 'HISTORY:'; echo \"\${HISTORY}\"
    echo 'GOALS:'; echo \"\${GOALS}\"
    echo 'TASKS:'; echo \"\${TASKS}\"
    echo ''
    
    # Source goals/tasks if they exist
    [ -f ~/.hurleyus/GOALS ] && source ~/.hurleyus/GOALS
    [ -f ~/.hurleyus/TASKS ] && source ~/.hurleyus/TASKS
    
    # Execute the task description as shell commands
    echo '${GREEN}=== Executing Task ===${NC}'
    eval \"${task_description}\"
    
    # Auto-git operations if in a repo
    if git rev-parse --git-dir > /dev/null 2>&1; then
      echo ''
      echo '${YELLOW}Git Status:${NC}'
      git status --short
      
      echo ''
      read -p 'Commit changes? (y/n) ' -n 1 -r
      if [[ \$REPLY =~ ^[Yy]\$ ]]; then
        git add -A
        git commit -m \"[${AGENT_NAME}] Task: ${task_title}\"
        git push origin HEAD
        echo '${GREEN}✅ Committed and pushed${NC}'
      fi
    fi
  " 2>&1 | tee "${TEMP_DIR}/transcript.log"
}

# Function: Main agent loop
main() {
  while true; do
    # Check for task assignment (file-based for now, would be WebSocket in prod)
    if [ -f "${TEMP_DIR}/inbox.json" ]; then
      local task=$(cat "${TEMP_DIR}/inbox.json")
      SESSION_ID=$(echo "$task" | jq -r '.sessionId')
      TASK_ID=$(echo "$task" | jq -r '.task.id')
      local title=$(echo "$task" | jq -r '.task.title')
      local description=$(echo "$task" | jq -r '.task.description')
      
      send_message "task_start" "\"taskId\": \"${TASK_ID}\""
      
      if execute_task "$title" "$description"; then
        local result=$(cat "${TEMP_DIR}/transcript.log")
        send_message "task_complete" "\"result\": \"${result//\"/\\\"}\""
        echo -e "${GREEN}✅ Task completed${NC}"
      else
        local error=$?
        send_message "task_failed" "\"error\": \"Task failed with exit code ${error}\""
        echo -e "${RED}❌ Task failed${NC}"
      fi
      
      rm -f "${TEMP_DIR}/inbox.json"
    fi
    
    sleep 1
  done
}

# Trap signals for graceful shutdown
trap 'echo -e "${YELLOW}Agent shutting down...${NC}"; exit 0' SIGINT SIGTERM

# Start agent
main
