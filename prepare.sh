#!/usr/bin/env bash
# Werewolf SQLx Prepare Script
# Runs migrations and prepares SQLx queries for offline mode

set -e

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

# Use production database for query preparation
DATABASE_URL="sqlite:/home/ribelo/.local/share/werewolf/werewolf.db"

echo "🗄️  Using production database: $DATABASE_URL"

echo "🔄 Running migrations..."
SQLX_OFFLINE=false sqlx migrate run --database-url $DATABASE_URL

echo "📝 Preparing SQLx queries for offline mode..."
SQLX_OFFLINE=false cargo sqlx prepare --database-url $DATABASE_URL

echo "✅ SQLx preparation complete!"
echo "   Query cache updated in .sqlx/ directory"
echo "   Don't forget to commit the .sqlx/ directory to version control"