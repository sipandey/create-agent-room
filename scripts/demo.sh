#!/usr/bin/env bash
# Live demo of create-agent-room's core trust claim: the scaffolded
# guardrails pre-commit hook actually blocks a staged secret, and the
# Claude Code Stop hook actually blocks an agent turn from ending without
# a logged decision/anti-pattern.
#
# Runs entirely inside a throwaway temp directory it creates and removes
# on exit (via `trap`) - safe to run repeatedly, touches nothing outside
# that temp dir. Intended to be recorded (asciinema/vhs) for the README
# demo GIF, but also just runs standalone: `bash scripts/demo.sh`.
#
# On the Stop hook: there is no way to trigger Claude Code's Stop hook
# *mechanism* from a plain shell script - it's Claude Code's own harness
# that invokes it at the end of an agent turn, and no such turn exists
# here. What this script does instead is invoke the real hook script
# directly (`node .agent-room/hooks/close-the-loop-check.js`) - the exact
# file Claude Code would run automatically - so its actual blocking logic
# is demonstrated for real, just outside the harness that normally calls
# it. This is not a simulation of the logic; it's the same code path, run
# manually instead of by Claude Code.

set -uo pipefail

# ---- terminal styling (safe no-ops if not a TTY) ----------------------
if [ -t 1 ]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RESET=$'\033[0m'
  RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; CYAN=$'\033[36m'
else
  BOLD=""; DIM=""; RESET=""; RED=""; GREEN=""; YELLOW=""; CYAN=""
fi

step() { printf '\n%s%s▶ %s%s\n' "$BOLD" "$CYAN" "$1" "$RESET"; }
ok()   { printf '%s✓ %s%s\n' "$GREEN" "$1" "$RESET"; }
note() { printf '%s%s%s\n' "$DIM" "$1" "$RESET"; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI="$REPO_ROOT/bin/cli.js"

DEMO_DIR="$(mktemp -d "${TMPDIR:-/tmp}/car-demo.XXXXXX")"
cleanup() { rm -rf "$DEMO_DIR"; }
trap cleanup EXIT

cd "$DEMO_DIR"

# create-agent-room is normally run via `npx create-agent-room`; this demo
# points that same command at the CLI in this checkout so the recording
# reflects the current code, offline and reproducibly.
create-agent-room() { node "$CLI" "$@"; }

# A fresh temp dir has no git identity of its own. Pre-create the repo so
# `init --git` (which runs `git init` again, harmlessly) has something to
# commit into, without touching the machine's real global git config.
git init -q
git config user.name  >/dev/null 2>&1 || git config user.name  "Demo User"
git config user.email >/dev/null 2>&1 || git config user.email "demo@example.com"

clear
printf '%s%screate-agent-room — guardrails demo%s\n' "$BOLD" "$CYAN" "$RESET"

step "Scaffold a project (Claude Code + git adapters)"
# Real output, minus the ~25-line per-file "created X" listing and the
# noisy full temp-dir paths - full detail is one command away
# (`init --dry-run`); the summary below is the part worth watching.
create-agent-room init . --yes --tools claude,git --git --name demo-project \
  | grep -v -e '^  created  ' -e '^Scaffolding agent-room' -e '^Start by reading'
sleep 2

step "Plant a fake AWS key in a source file"
cat > config.py <<'EOF'
AWS_ACCESS_KEY_ID = "AKIAIOSFODNN7EXAMPLE"
EOF
note "config.py now contains a hardcoded AWS access key."
cat config.py
sleep 2

step "Try to commit it"
git add config.py
if git commit -m "add config" 2>&1; then
  printf '%sUnexpected: the commit should have been blocked.%s\n' "$RED" "$RESET"
  exit 1
fi
ok "Blocked. No secret reached the repo."
sleep 3

step "Fix it — read the key from the environment instead — and commit again"
cat > config.py <<'EOF'
import os
AWS_ACCESS_KEY_ID = os.environ["AWS_ACCESS_KEY_ID"]
EOF
git add config.py
git commit -q -m "add config"
ok "Committed cleanly — the hook only blocks actual secrets."
sleep 2

step "The Claude Code Stop hook, run directly (see script header for why)"
echo "print('hello')" >> config.py
note "Uncommitted change made — no decision/anti-pattern logged yet."
if node .agent-room/hooks/close-the-loop-check.js; then
  printf '%sUnexpected: the Stop hook should have blocked this turn.%s\n' "$RED" "$RESET"
  exit 1
fi
ok "Blocked — an agent cannot end its turn here."
sleep 2

step "Log a waiver and re-check"
printf '\n<!-- no-log: demo change, nothing worth recording -->\n' >> .agent-room/decisions.md
node .agent-room/hooks/close-the-loop-check.js
ok "Clean — the turn may end."

printf '\n%s%sDone.%s Same guardrails, every time init --tools git,claude runs.\n' "$BOLD" "$GREEN" "$RESET"
