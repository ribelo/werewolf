#!/usr/bin/env bash
# PreToolUse guard (Bash): blocks commands that would destroy Werewolf databases.
#
# Privacy: the log records only the timestamp and the matched pattern name.
# Command text is never written to the log, because commands may carry credentials.

LOG_FILE="${CLAUDE_HOOK_LOG:-/tmp/claude-hook-debug.log}"

# Read JSON input from stdin
input=$(cat)

# Extract the bash command from the JSON
command=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null || true)

# Exit if no command found
if [ -z "$command" ]; then
    exit 0
fi

# Dangerous database operations to block
dangerous_patterns=(
    "rm.*werewolf\.db"
    "rm.*werewolf/werewolf\.db"
    "rm.*werewolf/backups"
    "rm -rf.*werewolf"
    "truncate.*werewolf\.db"
    "DROP DATABASE"
    "DROP TABLE.*competitors"
    "DROP TABLE.*contests"
    "DROP TABLE.*attempts"
    "DELETE FROM.*WHERE.*1=1"
    "DELETE FROM competitors$"
    "DELETE FROM contests$"
    "DELETE FROM attempts$"
)

# Check if command matches any dangerous pattern
for pattern in "${dangerous_patterns[@]}"; do
    if printf '%s' "$command" | grep -qE "$pattern"; then
        printf '%s blocked pattern=%s\n' "$(date -Is)" "$pattern" >> "$LOG_FILE"
        echo "ERROR: Blocked destructive database operation (matched rule: $pattern)." >&2
        echo "Do not delete, truncate or drop Werewolf data files or meet tables." >&2
        echo "Schema changes belong in a new migration under werewolf-cloud/migrations/;" >&2
        echo "never edit a migration that has already been applied." >&2
        echo "The legacy desktop database under src-tauri/ is reference only: do not modify it." >&2
        exit 2
    fi
done

# Allow safe commands
exit 0
