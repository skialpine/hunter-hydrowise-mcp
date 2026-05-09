#!/usr/bin/env bash
# PostToolUse hook for Bash. Fires once per new commit.
#
# Uses `git reflog -1 --format=%gs` to detect "a real commit just landed"
# instead of grepping the bash command string — that approach false-positives
# on commands that merely contain the substring "git commit" (echoing JSON
# payloads for tests, scripts that parse such strings, etc.).
#
# Skipped:
#   - amends, fixups, squashes (reflog says `commit (amend):`)
#   - rebases, resets, pulls, cherry-picks, reverts (different reflog prefixes)
#     (cherry-picks/reverts: the underlying change was likely already reviewed
#     on the source branch — auto-reviewing the replay is usually noise)
#   - bash commands that don't change HEAD (most of them)
#   - the same commit hash twice (state file dedupe — handles back-to-back
#     bash calls after a single commit)
#
# Known limitation: only the *latest* reflog entry is checked. If multiple
# commits land in a single bash invocation (e.g. `git commit -m A && git
# commit -m B`), only the most recent fires a reminder. Walking the reflog
# from .last-reviewed-hash to HEAD would close that gap; not implemented yet
# because batched-commit workflows are rare for this project.
#
# Soft-fail discipline: every external dependency check has `|| exit 0`. A
# broken hook environment (missing jq, unwritable .claude/, etc.) silently
# does nothing rather than spamming "hook failed" warnings on every Bash call.

set -uo pipefail

# Hard prerequisite — without jq we can't emit valid hookSpecificOutput JSON.
command -v jq >/dev/null 2>&1 || exit 0

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." 2>/dev/null && pwd)" || exit 0

# git reflog %gs: "<subject>" — e.g. "commit: foo" or "commit (amend): foo".
REFLOG="$(git -C "$REPO_ROOT" reflog -1 --format=%gs 2>/dev/null || true)"
[ -z "$REFLOG" ] && exit 0

# Match new authored commits: regular, initial, and merge-resolution commits.
# Reject everything else (amend, rebase, reset, pull, cherry-pick, revert).
echo "$REFLOG" | grep -qE '^commit(:| \(initial\):| \(merge\):)' || exit 0

HEAD_HASH="$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || true)"
[ -z "$HEAD_HASH" ] && exit 0

STATE_FILE="$REPO_ROOT/.claude/hooks/.last-reviewed-hash"
LAST="$(cat "$STATE_FILE" 2>/dev/null || true)"
[ "$HEAD_HASH" = "$LAST" ] && exit 0

SHORT="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || true)"
SUBJECT="$(git -C "$REPO_ROOT" log -1 --format=%s 2>/dev/null || true)"
[ -z "$SHORT" ] || [ -z "$SUBJECT" ] && exit 0

# Build the JSON first; if jq fails, we abort BEFORE writing the state file
# so the next bash call retries (no silent loss of a reminder).
JSON="$(jq -nc \
  --arg hash "$HEAD_HASH" \
  --arg short "$SHORT" \
  --arg subject "$SUBJECT" \
  '{
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: ("Standing review-after-commit policy (project hook): just landed " + $short + " \"" + $subject + "\". Review " + $hash + " now — dispatch the pr-review-toolkit agents (code-reviewer, silent-failure-hunter, type-design-analyzer, comment-analyzer) in parallel against `git show " + $hash + "` and consolidate findings before any further work.")
    }
  }' 2>/dev/null)" || exit 0
[ -z "$JSON" ] && exit 0

# Emit the reminder, THEN record the hash. If anything above failed we never
# reach here; the next bash call will retry with the same HEAD and try again.
printf '%s\n' "$JSON"
mkdir -p "$(dirname "$STATE_FILE")" 2>/dev/null && printf '%s\n' "$HEAD_HASH" > "$STATE_FILE" 2>/dev/null || true
