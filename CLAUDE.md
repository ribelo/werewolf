# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Werewolf is a Tauri-based desktop application for managing powerlifting contests, built with:
- **Frontend**: Svelte + Vite (port 1420)
- **Backend**: Rust with Tauri framework
- **Package Manager**: Bun (as configured in tauri.conf.json)

### Application Purpose
- **Contest Management**: Simple CRUD operations for competitors, attempts, and results
- **Dual-Window Architecture**: Separate organizer and display interfaces
- **Real-time Updates**: Synchronization between administrator and presentation views

### Database Location
- **SQLite Database**: `~/.local/share/werewolf/werewolf.db` (Linux XDG data directory)
- **Backup Directory**: `~/.local/share/werewolf/backups/`
- **Debug Database**: `sqlite3 ~/.local/share/werewolf/werewolf.db "SELECT * FROM competitors;"`

### Requirements & Roadmap
See [REQUIREMENTS_AND_ROADMAP.md](./REQUIREMENTS_AND_ROADMAP.md) for detailed scope definition, strategic analysis, and development roadmap based on user requirements.

## Build Commands

### NixOS Development Environment
```bash
# Enter development shell with all dependencies
nix develop

# Or using legacy nix-shell
nix-shell
```

### Development
```bash
# Start development server (runs both frontend and Tauri)
bun run tauri dev
# Or use the development script
./dev.sh

# Frontend development only
bun run dev

# Install dependencies
bun install

# Run Rust checks (check, clippy, fmt)
./check.sh

# Prepare SQLx queries for offline mode (after adding new queries)
./prepare.sh
```

### Building
```bash
# Build for production
bun run tauri build

# Frontend build only
bun run build

# Preview production build
bun run preview
```

### Rust Backend
```bash
# Run all Rust checks (recommended)
./check.sh

# Or run individual commands in src-tauri directory:
cd src-tauri

# Run Rust tests
cargo test

# Check Rust code
cargo check

# Format Rust code
cargo fmt

# Run Clippy linter
cargo clippy
```

## Architecture

### Design Principles
- **Backend-Heavy**: All business logic in Rust, frontend as "dumb views"
- **Database-Centric State**: Global state lives in SQLite database
- **Optimistic Updates**: Unidirectional flow (FE → Command → DB → Response)
- **Simplicity First**: Minimal, stable features for non-technical user (Andrzej)
- **No Real-time Sync**: Frontend never receives automatic updates from backend

### Dual-Window Design
The application features two distinct windows:

1. **Main Organizer Window**:
   - Tile-based main view (settings, competitions)
   - Real-time editable table/dashboard for running competitions
   - Button to open display window for current lifter
   - All CRUD operations and contest management

2. **Display Window** (opened on-demand):
   - Shows specific competitor's next lift information
   - Blank background (details TBD)
   - Created dynamically when needed during competition
   - No automatic updates - controlled from organizer window

### Frontend Structure (`src/`)
- **Svelte 5.38** with TypeScript
- **Domain-agnostic**: No knowledge of database implementation
- **Form state only**: Temporary UI state managed on frontend
- **Command-based**: Calls domain-based Tauri commands only

### Backend Structure (`src-tauri/`)
- **Database as State**: SQLite database holds all application state
- **Domain-based Commands**: `contest_create`, `competitor_register`, etc.
- **Thread-safe Access**: `Arc<Mutex<AppState>>` with std library
- **Error Propagation**: `thiserror` errors all the way through stack
- **Window Management**: Dynamic display window creation via Tauri API

### Key Integration Points
- **Domain Commands**: `contest_*`, `competitor_*`, `attempt_*`, `result_*`
- **Window Management**: Commands to create/manage display window
- **Database-Centric**: All state queries hit database directly
- **Local Only**: No internet, cloud, or external sync requirements

## Development Workflow

### IMPORTANT: Application Execution Policy
- **NEVER** start the application (`bun run tauri dev`) automatically
- **USER IS RESPONSIBLE FOR RUNNING IT** - Claude should only provide guidance and fixes
- Only run compilation checks (`cargo check`, `cargo clippy`) or other development commands
- If testing is needed, ask the user to run the application themselves

### Core Development Patterns

1. **Domain-based Commands**:
   - Define commands by domain: `contest_*`, `competitor_*`, `attempt_*`, `result_*`
   - All business logic stays in Rust backend
   - Use existing Database struct for all operations
   - Propagate `thiserror` errors to frontend

2. **Window Management**:
   - Main organizer window always open
   - Display window created dynamically via commands
   - Use window labels for targeting: "main", "display"
   - No automatic cross-window updates

3. **State Management**:
   - Database as single source of truth
   - No persistent in-memory state in backend
   - Frontend manages only temporary form state
   - Query database directly for all data

### Adding New Tauri Commands
1. Define command in `src-tauri/src/commands/` by domain
2. Use Database struct methods for all operations  
3. Register command in `src-tauri/src/lib.rs` invoke_handler
4. Frontend calls via `invoke("domain_action", { args })`

### Frontend Development
- Hot module replacement enabled on port 1420
- Svelte 5.38 with TypeScript, runes and modern features
- `bun run check` for TypeScript checking
- Router setup for organizer and display views

### Rust Backend Development
- Standard Cargo workspace in `src-tauri/`
- Serde for JSON serialization between frontend and backend
- Simple data models for competitors, attempts, and contest state
- Event system for window synchronization

### Database Development with SQLx
- **ALWAYS use compile-time safe SQLx macros**: `query!()`, `query_as!()`, `query_scalar!()`
- **NEVER use runtime-only functions**: `query()`, `query_as()`, `query_scalar()`
- Compile-time macros provide SQL validation, type checking, and automatic result mapping
- Runtime functions are error-prone and lack compile-time safety guarantees
- Example: Use `sqlx::query!("SELECT id, name FROM competitors WHERE id = ?", id)` instead of `sqlx::query("SELECT id, name FROM competitors WHERE id = ?").bind(id)`

### Database Migrations - CRITICAL RULES
- **NEVER modify existing migration files** once they've been applied to any database (local, staging, production)
- **ALWAYS create new migration files** for schema changes, even small ones
- **Use descriptive names** with timestamp prefix: `YYYYMMDDHHMMSS_descriptive_name.sql`
- **Test migrations locally** before committing to ensure they work correctly
- **Include rollback strategy** in migration comments when possible

#### Migration Best Practices:
1. **Check migration status** before making changes:
   ```bash
   sqlite3 ~/.local/share/werewolf/werewolf.db "SELECT version, installed_on FROM _sqlx_migrations ORDER BY version;"
   ```

2. **Create new migrations** for any schema changes:
   ```bash
   # Example: Adding a new column
   sqlx migrate add add_new_column_to_table
   ```

3. **For development environment conflicts**:
   ```bash
   # ONLY for local development - deletes all data!
   rm ~/.local/share/werewolf/werewolf.db
   # Application will recreate database on next startup
   ```

#### Common Migration Errors:
- **"migration was previously applied but has been modified"**: Someone edited an already-applied migration file
- **Solution**: Delete local database for development, or create a new migration file for production
- **Prevention**: Never edit files in `migrations/` directory once they've been applied

#### Migration Troubleshooting:
```bash
# Check which migrations are applied
sqlite3 ~/.local/share/werewolf/werewolf.db "SELECT version, hex(checksum), installed_on FROM _sqlx_migrations;"

# Check current migration files
ls -la src-tauri/migrations/

# Calculate checksum of specific migration
sha256sum src-tauri/migrations/MIGRATION_FILE.sql
```

### Internationalization (i18n) Requirements
- **NEVER use hardcoded strings in HTML/Svelte templates**
- **ALL user-visible text must use i18n translation keys**
- Use `$t('key.name')` syntax for all displayed text
- Store translation keys in appropriate JSON files
- Support Polish (primary) and English languages
- Examples:
  - ❌ Bad: `<button>Save</button>`
  - ✅ Good: `<button>{$t('common.save')}</button>`
  - ❌ Bad: `error = "Failed to save competitor"`
  - ✅ Good: `error = $t('errors.competitor.save_failed')`
- **Console/debug messages can remain in English**
- **Database content and API responses are separate from UI i18n**

## Configuration Files

- **flake.nix**: Nix development environment with Tauri, Rust, and Node.js dependencies
- **tauri.conf.json**: Main Tauri configuration, build commands, and app settings
- **Cargo.toml**: Rust dependencies and build configuration  
- **package.json**: Frontend dependencies and npm scripts
- **vite.config.ts**: Frontend build configuration optimized for Tauri
- **vite.config.js**: Vite configuration for Svelte development

## NixOS Development Environment

The project includes a `flake.nix` that provides:
- **Rust toolchain** with rust-analyzer, clippy, and rustfmt
- **Bun and Node.js** for frontend development
- **cargo-tauri** CLI tool
- **System dependencies** required for Tauri (WebKit, GTK, OpenSSL, etc.)
- **Environment variables** properly configured for Tauri development

Use `nix develop` to enter the development shell with all dependencies available.