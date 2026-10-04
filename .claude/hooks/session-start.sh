#!/usr/bin/env bash
# SessionStart hook: tell Claude where this checkout stands relative to dev,
# so parallel teammates don't build on a stale branch. Output goes into context.
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

branch=$(git branch --show-current)
echo "Git: on branch '${branch:-detached}'."

if git remote get-url origin >/dev/null 2>&1; then
  GIT_TERMINAL_PROMPT=0 git fetch --quiet origin dev 2>/dev/null
  if git rev-parse --verify --quiet origin/dev >/dev/null; then
    behind=$(git rev-list --count HEAD..origin/dev 2>/dev/null || echo 0)
    [ "$behind" -gt 0 ] && echo "Branch is $behind commit(s) behind origin/dev — sync before starting new work."
  fi
fi

case "$branch" in
  main|dev) echo "On $branch: start work with /start-task <issue#>, which branches off dev. Don't commit to main or dev." ;;
esac

# The user's open issues, so the agent knows what they're working on.
if command -v gh >/dev/null 2>&1 && git remote get-url origin >/dev/null 2>&1; then
  mine=$(gh issue list --assignee @me --state open --limit 5 --json number,title \
    --jq '.[] | "#\(.number) \(.title)"' 2>/dev/null)
  [ -n "$mine" ] && printf 'Your open issues:\n%s\n' "$mine"
fi

changes=$(git status --porcelain | wc -l | tr -d ' ')
[ "$changes" -gt 0 ] && echo "$changes uncommitted change(s) in the working tree."
exit 0
