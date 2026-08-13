#!/usr/bin/env bash
# WorktreeCreate hook: make a freshly created git worktree actually usable.
#
# A worktree is a bare checkout — it has no node_modules and none of the files
# `postinstall` generates. Symlinking the main checkout's root node_modules is
# NOT enough for a pnpm workspace: each package's dependencies (including the
# workspace links between them) live in `<pkg>/node_modules`, so with only the
# root linked, tsc cannot resolve sibling packages and any suite importing a
# generated file fails. `pnpm install` builds the whole symlink farm and runs
# postinstall; with a warm store it is a few seconds and mostly links.
#
# STDOUT IS THE WORKTREE PATH, and nothing else. The runtime reads this hook's
# stdout as the path to enter and fails the whole EnterWorktree if it is empty
# or is not a directory. An earlier version echoed
# `{"systemMessage":"worktree ready"}` here, which made EnterWorktree chdir into
# a directory of that name; status therefore goes to the log below, alongside
# the pnpm output. Exit non-zero (or print nothing) only to abort the entry.
#
# Test it without creating a worktree (prints the path; status is in the log):
#   echo '{"worktree_path":"/path/to/worktree"}' | .claude/hooks/setup-worktree.sh
set -uo pipefail

payload=$(cat)
log=~/.claude/worktree-hook.log

# The exact field name is whatever the runtime sends; accept the plausible ones
# and fall back to the working directory, which is the new worktree when the
# runtime runs the hook there.
dir=$(printf '%s' "$payload" |
  jq -r '.worktree_path // .worktreePath // .path // .worktree // .cwd // empty' 2>/dev/null)
dir=${dir:-$PWD}

note() { echo "$*" >>"$log" 2>/dev/null; }

{
  echo "--- $(date -Is) ---"
  echo "resolved dir: $dir"
  echo "payload: $payload"
} >>"$log" 2>/dev/null

if [ ! -f "$dir/pnpm-lock.yaml" ]; then
  note "RESULT: skipped, no pnpm-lock.yaml in $dir"
  echo "$dir"
  exit 0
fi

# A stale symlink here would make pnpm try to remove the main checkout's
# node_modules; it aborts rather than doing so, but clear it either way.
if [ -L "$dir/node_modules" ]; then
  rm -f "$dir/node_modules"
fi

if (cd "$dir" && pnpm install --frozen-lockfile) >>"$log" 2>&1; then
  note "RESULT: ok, pnpm install complete"
else
  # still enter the worktree — a failed install is recoverable by hand, an
  # aborted EnterWorktree just loses the checkout the runtime already made
  note "RESULT: FAILED, run 'pnpm install' in $dir yourself"
fi
echo "$dir"
exit 0
