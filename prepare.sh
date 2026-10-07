#!/usr/bin/env bash
# Werewolf SQLx Prepare Script (legacy desktop app)
# Runs migrations and prepares SQLx queries for offline mode.
#
# Migrations are destructive: point DATABASE_URL at a disposable SQLite database.
# The production database (~/.local/share/werewolf/werewolf.db) is never a valid target.

set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
    echo "ERROR: DATABASE_URL is not set. Refusing to run." >&2
    echo "       This script runs SQLx migrations, so it requires an explicit path to a" >&2
    echo "       disposable database, for example:" >&2
    echo "         DATABASE_URL=sqlite:/tmp/werewolf-prepare.db ./prepare.sh" >&2
    exit 1
fi

case "$DATABASE_URL" in
    *".local/share/werewolf/werewolf.db"*)
        echo "ERROR: DATABASE_URL points at the production Werewolf database. Refusing to run." >&2
        echo "       Use a throwaway copy instead, e.g. cp ~/.local/share/werewolf/werewolf.db /tmp/werewolf-prepare.db" >&2
        exit 1
        ;;
esac

echo "🐺 Running Werewolf SQLx preparation..."
echo "   Setting up environment for stable Rust"

# Disable sccache wrapper and nightly flags (same as check.sh)
export RUSTC_WRAPPER=""
export RUSTFLAGS="-C target-cpu=native"
export CARGO_ENCODED_RUSTFLAGS=""

echo "   Environment configured:"
echo "   RUSTC_WRAPPER: $RUSTC_WRAPPER"
echo "   RUSTFLAGS: $RUSTFLAGS"
echo ""

# Change to src-tauri directory
cd src-tauri

echo "🗄️  Using disposable database: $DATABASE_URL"

echo "🔄 Running migrations..."
SQLX_OFFLINE=false sqlx migrate run --database-url "$DATABASE_URL"

echo "📝 Preparing SQLx queries for offline mode..."
SQLX_OFFLINE=false cargo sqlx prepare --database-url "$DATABASE_URL"

echo "✅ SQLx preparation complete!"
echo "   Query cache updated in .sqlx/ directory"
echo "   Don't forget to commit the .sqlx/ directory to version control"
