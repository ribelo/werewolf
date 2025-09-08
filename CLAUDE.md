# CLAUDE.md - Project Instructions for AI Assistant

**Instructions for Claude Code (claude.ai/code) when working with this Tauri-based powerlifting contest management application.**

**Key Context**: This is a production-ready application built for Polish powerlifting meet directors who need reliable, offline contest management without complexity overhead.

## Project Overview

Werewolf is a Tauri-based desktop application for managing powerlifting contests, built with:
- **Frontend**: Svelte + Vite (port 1420)
- **Backend**: Rust with Tauri framework
- **Package Manager**: Bun (as configured in tauri.conf.json)

### Application Purpose
- **Contest Management**: Simple CRUD operations for competitors, attempts, and results
- **Dual-Window Architecture**: Separate organizer and display interfaces  
- **Real-time Updates**: Manual synchronization between administrator and presentation views
- **Offline-First**: No internet dependency, SQLite local database
- **Polish/English i18n**: Built for Polish Powerlifting Federation standards

### Database Location
- **SQLite Database**: `~/.local/share/werewolf/werewolf.db` (Linux XDG data directory)
- **Backup Directory**: `~/.local/share/werewolf/backups/`
- **Debug Database**: `sqlite3 ~/.local/share/werewolf/werewolf.db "SELECT * FROM competitors;"`

### Project Scope & Requirements
**See [REQUIREMENTS_AND_ROADMAP.md](./REQUIREMENTS_AND_ROADMAP.md)** for detailed scope definition.

**IN SCOPE**: Simple attempt tracking, offline operation, dual windows, flexible editing, basic export
**OUT OF SCOPE**: Federation uploads, timer management, judge scoring, complex validation rules, hardware integration

**Core Philosophy**: Simplicity and reliability over feature completeness. Built for real-world powerlifting meets in gyms with unreliable internet.

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

### CRITICAL: Application Execution Policy
- **NEVER** start the application (`bun run tauri dev`) automatically
- **USER IS RESPONSIBLE FOR RUNNING IT** - Claude provides guidance and fixes only
- **Only run compilation checks** (`cargo check`, `cargo clippy`, `./check.sh`)
- **If testing needed**: Ask user to run the application themselves
- **Rationale**: Desktop app with window management - user must control execution

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

### Adding New Tauri Commands - Step by Step

1. **Define Command Function** in `src-tauri/src/commands/[domain].rs`:
   ```rust
   #[tauri::command]
   pub async fn competitor_create(
       state: tauri::State<'_, AppState>,
       competitor: CompetitorCreate,
   ) -> Result<Competitor, AppError> {
       let db = state.database.lock().await;
       db.competitor_create(competitor).await
   }
   ```

2. **Use Database Methods**: Always use existing `Database` struct methods
3. **Register in Handler**: Add to `src-tauri/src/lib.rs` `invoke_handler![]`
4. **Frontend Call**: `const result = await invoke('competitor_create', { competitor })`
5. **Error Handling**: Use `thiserror` errors, propagate to frontend

**Pattern**: Domain-based commands (`contest_*`, `competitor_*`, `attempt_*`, `result_*`)

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

### Database Development with SQLx - CRITICAL RULES

**ALWAYS use compile-time safe SQLx macros:**
- `sqlx::query!("SELECT id, name FROM competitors WHERE id = ?", id)` ✅
- `sqlx::query_as!(Model, "SELECT * FROM table WHERE id = ?", id)` ✅ 
- `sqlx::query_scalar!("SELECT COUNT(*) FROM competitors")` ✅

**NEVER use runtime-only functions:**
- `sqlx::query("SELECT...").bind(id)` ❌ (no compile-time validation)
- `sqlx::query_as("SELECT...")` ❌ (no type safety)
- `sqlx::query_scalar("SELECT...")` ❌ (no SQL validation)

**Why**: Compile-time macros provide SQL validation, type checking, and automatic result mapping. Runtime functions are error-prone and will cause production failures.

**Database URL**: Set `DATABASE_URL="sqlite:~/.local/share/werewolf/werewolf.db"` in `.env` for SQLx compile-time checking.

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

### Internationalization (i18n) - MANDATORY REQUIREMENTS

**ZERO hardcoded user-visible strings allowed:**
- ❌ `<button>Save</button>`
- ✅ `<button>{$t('common.save')}</button>`
- ❌ `error = "Failed to save competitor"`
- ✅ `error = $t('errors.competitor.save_failed')`
- ❌ `<h1>Contest Results</h1>`
- ✅ `<h1>{$t('contest.results.title')}</h1>`

**Translation Files:**
- `src/lib/i18n/locales/pl.json` - Polish (primary language)
- `src/lib/i18n/locales/en.json` - English (secondary)

**Usage Pattern**: `$t('domain.section.key')` for all UI text

**Exceptions (English allowed):**
- Console/debug messages
- Code comments
- Database schema and internal data
- API error messages (internal)

**Validation**: All Svelte templates must use `$t()` for user-facing text.

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

---

## Working with this Codebase - AI Assistant Guidelines

### Code Style and Patterns
1. **Follow existing patterns** - this codebase has established conventions
2. **Backend-heavy architecture** - business logic stays in Rust, frontend is "dumb views"
3. **Database as state** - SQLite holds all application state, no in-memory complexity
4. **Command-based** - frontend calls Tauri commands, no direct database access
5. **Error propagation** - use `thiserror` errors throughout the stack

### What to Focus On
- **Reliability over features** - this is production software for real competitions
- **Simple, testable code** - complex abstractions are discouraged
- **Polish/English i18n** - all user-facing text must be translatable
- **SQLite best practices** - compile-time checked queries only
- **Clear error messages** - users need actionable feedback

### Common Tasks and Patterns
- **Adding new competitor fields**: Update database schema, models, commands, and UI components
- **New attempt tracking**: Follow existing squat/bench/deadlift patterns
- **Display window updates**: Use Tauri window API, no automatic sync
- **Export functionality**: Generate files in user-specified formats
- **Backup/restore**: SQLite file operations with proper error handling

### Testing Strategy
- **Unit tests** for business logic in Rust
- **Integration tests** for database operations
- **Manual testing** for UI workflows (user runs application)
- **No mocking** - test with real SQLite database

**Remember**: This app exists because existing powerlifting software is expensive, overcomplicated, or requires internet. Keep it simple, reliable, and offline-first.