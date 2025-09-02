#!/usr/bin/env bash

# Read JSON input from stdin
input=$(cat)

# Extract the bash command from the JSON
command=$(echo "$input" | jq -r '.tool_input.command // empty')

# Debug: minimal logging
echo "Hook: $(date) - $command" >> /tmp/claude-hook-debug.log

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
    if echo "$command" | grep -qE "$pattern"; then
        echo "BLOCKED: $command" >> /tmp/claude-hook-debug.log
        echo "ERROR: Blocked dangerous database operation: $command" >&2
        echo "Use proper database migrations instead of deleting data files." >&2
        echo "For schema changes, create a new migration file in src-tauri/migrations/" >&2
        exit 2
    fi
done

# Allow safe commands
exit 0