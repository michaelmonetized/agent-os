#!/usr/bin/env bash

set -euo pipefail

cd ~/.openclaw/workspace/agent-os

echo "🚀 HurleyUS Agent OS — Startup"
echo "================================"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
bun install 2>/dev/null || echo "⚠️  Dependencies may already be installed"
echo ""

# Load tasks
echo "📋 Loading Mission Control Phase 1 tasks..."
bun cli.ts load-mission-control
echo ""

# Show status
echo "📊 Project Status:"
bun cli.ts status
echo ""

# Ask to run
echo "🔥 Ready to start task processing."
echo "   Run: bun cli.ts run"
echo ""
