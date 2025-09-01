#!/usr/bin/env bash
# Werewolf Check Script
# Runs cargo check with stable Rust configuration

set -e

echo "🐺 Running Werewolf Rust checks..."
echo "   Overriding global nightly flags for stable Rust"

# Disable sccache wrapper and nightly flags
export RUSTC_WRAPPER=""
export RUSTFLAGS="-C target-cpu=native"

# More robust flag encoding for complex scenarios
export CARGO_ENCODED_RUSTFLAGS=""

echo "   Environment configured:"
echo "   RUSTC_WRAPPER: $RUSTC_WRAPPER"
echo "   RUSTFLAGS: $RUSTFLAGS"
echo ""

# Change to src-tauri directory and run checks
cd src-tauri

echo "🔍 Running cargo check..."
cargo check

echo "🎯 Running cargo clippy..."
cargo clippy -- -D warnings

echo "📝 Running cargo fmt check..."
cargo fmt --check

echo "✅ All checks passed!"