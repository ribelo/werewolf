#!/usr/bin/env bash
# Werewolf Development Script
# Overrides global Cargo config to use stable Rust

set -e

echo "🐺 Starting Werewolf development environment..."
echo "   Overriding global nightly flags for stable Rust"

# Disable sccache wrapper and nightly flags
export RUSTC_WRAPPER=""
export RUSTFLAGS="-C link-arg=--ld-path=wild -C target-cpu=native"

# More robust flag encoding for complex scenarios
export CARGO_ENCODED_RUSTFLAGS=""

echo "   Environment configured:"
echo "   RUSTC_WRAPPER: $RUSTC_WRAPPER"
echo "   RUSTFLAGS: $RUSTFLAGS"
echo ""

# Run the Tauri dev server
exec bun run tauri dev