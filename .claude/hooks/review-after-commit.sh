#!/usr/bin/env bash
# PostToolUse hook for Bash. Fires once per new commit.
#
# Uses git reflog to detect "a real commit just landed" rather than grepping the
# bash command string — that approach false-positives on commands that merely
# contain the substring "git commit" (e.g., echoing JSON for tests, or scripts
# that parse such strings).
#
# Triggers ON: reflog last entry matches `commit:` or `commit (initial):` AND
# the resulting HEAD hash differs from .last-reviewed-hash.
#
# Skipped:
#   - amends, fixups, squashes (reflog says `commit (amend):`)
#   - rebases, resets, merges, pulls, cherry-picks (different reflog prefixes)
#   - bash commands that don't change HEAD (most of them)
#   - the same commit hash twice (state file dedupe — handles back-to-back
#     bash calls after a single commit)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Reflog last entry format: "<subject>" e.g. "commit: foo bar" or "commit (amend): foo".
REFLOG="$(git -C "$REPO_ROOT" reflog -1 --format=%gs 2>/dev/null || true)"
[ -z "$REFLOG" ] && exit 0

# Only fire on regular and initial commits; skip amend/rebase/reset/pull/merge/cherry-pick.
echo "$REFLOG" | grep -qE '^commit(:| \(initial\):)' || exit 0

HEAD_HASH="$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null)" || exit 0
[ -z "$HEAD_HASH" ] && exit 0

STATE_FILE="$REPO_ROOT/.claude/hooks/.last-reviewed-hash"
LAST="$(cat "$STATE_FILE" 2>/dev/null || true)"

# Already reminded for this exact commit — stay silent.
[ "$HEAD_HASH" = "$LAST" ] && exit 0

# Record the new hash before emitting so back-to-back bash calls don't repeat.
mkdir -p "$(dirname "$STATE_FILE")"
echo "$HEAD_HASH" > "$STATE_FILE"

SHORT="$(git -C "$REPO_ROOT" rev-parse --short HEAD)"
SUBJECT="$(git -C "$REPO_ROOT" log -1 --format=%s)"

jq -nc \
  --arg hash "$HEAD_HASH" \
  --arg short "$SHORT" \
  --arg subject "$SUBJECT" \
  '{
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: ("Standing review-after-commit policy (project hook): just landed " + $short + " \"" + $subject + "\". Review " + $hash + " now — dispatch the pr-review-toolkit agents (code-reviewer, silent-failure-hunter, type-design-analyzer, comment-analyzer) in parallel against `git show " + $hash + "` and consolidate findings before any further work.")
    }
  }'
