#!/bin/bash
set -e

# Get branch names from environment or use defaults
BRANCH1=${BRANCH1:-$(git rev-parse --abbrev-ref HEAD)}
BRANCH2=${BRANCH2:-main}

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Error: Uncommitted changes detected. Please commit or stash your changes first."
  exit 1
fi

echo "Building branch: $BRANCH1"
echo "Building branch: $BRANCH2"

# Save current branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

# Clean up old benchmark build folders
rm -rf dist_branch1 dist_branch2

# Build first branch (current optimized branch)
echo "=== Building $BRANCH1 ==="
git checkout "$BRANCH1"
yarn build
mv dist dist_branch1
echo "$BRANCH1" >dist_branch1/.branch_name

# Build second branch (main/baseline)
echo "=== Building $BRANCH2 ==="
git checkout "$BRANCH2"
yarn build
mv dist dist_branch2
echo "$BRANCH2" >dist_branch2/.branch_name

# Return to original branch
git checkout "$CURRENT_BRANCH"

echo "=== Build complete ==="
echo "Branch 1: $BRANCH1 -> dist_branch1"
echo "Branch 2: $BRANCH2 -> dist_branch2"
