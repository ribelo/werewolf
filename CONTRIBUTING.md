# Contributing to Werewolf

**Thanks for considering contributing to Werewolf - the rock-solid powerlifting contest management application.**

**This project exists to solve real problems for powerlifting meet directors. Every contribution should make their lives easier, not add complexity they don't need.**

---

## Quick Start for Contributors

### What You're Contributing To

**Werewolf is intentionally simple:**
- Desktop app that works offline (no cloud, no subscriptions, no bullshit)
- Manages powerlifting competitions from registration to results
- Dual-window system: organizer interface + spectator display
- Built for Polish Powerlifting Federation but works internationally
- Zero external dependencies during competition (SQLite database)

**What we're NOT building:**
- Timer systems, judge scoring, federation uploads, hardware integration
- Complex validation rules, multiple platforms, announcer features
- Cloud sync, multi-user access, audit trails, or banking-level security

See `REQUIREMENTS_AND_ROADMAP.md` for the complete scope definition.

### Prerequisites

**Required:**
- Rust (latest stable)
- Bun (package manager - faster than npm/yarn)
- SQLite
- Git
- Basic understanding of Tauri, Svelte, and SQLite

**Recommended:**
- NixOS (development shell with all dependencies)
- VS Code with Rust, Svelte, and Tauri extensions
- Experience with powerlifting competitions (helps understand the domain)

### Development Environment Setup

```bash
# Clone the repository
git clone <repository-url>
cd werewolf

# Option 1: NixOS users (easiest)
nix develop
bun install

# Option 2: Manual setup
# Install Rust: https://rustup.rs/
# Install Bun: https://bun.sh/
bun install

# Create environment file for SQLx
echo 'DATABASE_URL="sqlite:~/.local/share/werewolf/werewolf.db"' > src-tauri/.env

# Run all quality checks
./check.sh              # Rust formatting, linting, tests
bun check               # Frontend type checking

# Start development (user runs this, not automated)
bun run tauri dev       # Opens desktop app with hot reload
```

---

## Development Workflow

### Before You Start

1. **Read existing code** - understand the patterns and architecture
2. **Check the scope** - make sure your idea fits the project goals
3. **Search existing issues** - avoid duplicate work
4. **Start small** - fix bugs or small improvements before major features

### Making Changes

**Code Quality Requirements:**
```bash
# These must pass before any commit
./check.sh              # Rust fmt, clippy, tests
bun check               # Frontend type checking
```

**Testing Strategy:**
- **Unit tests** for business logic in Rust (`cargo test`)
- **Integration tests** for database operations
- **Manual testing** for UI workflows (run the app and test by hand)
- **No mocking** - use real SQLite database for integration tests

**Git Workflow:**
1. **Fork the repository**
2. **Create feature branch** (`git checkout -b feature/description`)
3. **Make small, focused commits** with clear messages
4. **Test thoroughly** on your local machine
5. **Open pull request** with description of changes and testing done

### Code Style and Architecture

**Backend (Rust) Patterns:**
- **Domain-based commands**: `contest_create`, `competitor_register`, `attempt_record`
- **Database as state**: All application state lives in SQLite
- **Compile-time SQL**: Use `sqlx::query!()` macros, never runtime queries
- **Error propagation**: `thiserror` errors through the entire stack
- **No complex abstractions**: Keep it simple and testable

**Frontend (Svelte) Patterns:**
- **Dumb views**: Frontend calls Tauri commands, displays results
- **No complex state**: Temporary form state only, database holds real state
- **Mandatory i18n**: ALL user-visible text uses `$t('key.name')` translation
- **TypeScript**: Full type safety with Svelte 5.38 and runes

**Database (SQLite) Rules:**
- **Compile-time checked queries**: Always use `sqlx::query!()` macros
- **Never modify migrations**: Once applied, migrations are immutable
- **New migrations for changes**: Even small schema changes need new migration files
- **Local development reset**: `rm ~/.local/share/werewolf/werewolf.db` to reset

---

## Types of Contributions We Need

### High Priority (Always Welcome)

**Bug Fixes:**
- Crashes, data corruption, incorrect calculations
- UI inconsistencies or translation errors
- Build issues on different platforms
- Database migration problems

**Documentation Improvements:**
- User guides for meet directors
- Developer documentation and API docs
- Architecture explanations and decision rationale
- Installation and troubleshooting guides

**Testing and Quality:**
- Unit tests for business logic
- Integration tests for database operations
- Platform-specific testing (Windows/macOS/Linux)
- Performance testing with large competitions

### Medium Priority (Case-by-Case)

**Small Feature Additions:**
- New export formats (PDF certificates, federation-specific CSV)
- Additional competitor fields or categories
- UI improvements for better workflow
- Keyboard shortcuts for power users

**Developer Experience:**
- Build process improvements
- Better error messages and debugging
- Code organization and refactoring
- Performance optimizations

### Lower Priority (Discuss First)

**New Features:**
- Major UI changes or new windows
- Additional scoring systems
- Import/export integrations
- Configuration options

**Before starting major features**: Open an issue to discuss fit with project goals.

---

## Specific Contribution Guidelines

### Adding New Tauri Commands

**Pattern to follow:**
```rust
// src-tauri/src/commands/competitor.rs
#[tauri::command]
pub async fn competitor_create(
    state: tauri::State<'_, AppState>,
    competitor: CompetitorCreate,
) -> Result<Competitor, AppError> {
    let db = state.database.lock().await;
    db.competitor_create(competitor).await
}
```

1. **Define in domain-specific file** (`src-tauri/src/commands/competitor.rs`)
2. **Use existing Database methods** - don't duplicate database logic
3. **Register in handler** (`src-tauri/src/lib.rs` `invoke_handler![]`)
4. **Add to frontend types** if using TypeScript bindings
5. **Write unit tests** for the command logic

### Database Schema Changes

**CRITICAL RULES:**
```bash
# NEVER modify existing migrations
# ALWAYS create new migration files
sqlx migrate add descriptive_name_of_change

# Test locally before committing
cargo run -- db migrate
cargo test

# Check migration applied correctly
sqlite3 ~/.local/share/werewolf/werewolf.db "SELECT * FROM _sqlx_migrations;"
```

### Frontend Component Development

**Required patterns:**
```svelte
<!-- All user-visible text must be translatable -->
<button>{$t('competitor.create.button')}</button>
<h1>{$t('contest.results.title')}</h1>
<div>{$t('errors.database.connection_failed')}</div>

<!-- Use existing stores and command patterns -->
<script lang="ts">
  import { invoke } from '@tauri-apps/api/core'
  import { t } from 'svelte-i18n'
  
  async function createCompetitor() {
    try {
      await invoke('competitor_create', { competitor })
    } catch (error) {
      errorMessage = $t('errors.competitor.create_failed')
    }
  }
</script>
```

### Internationalization (i18n)

**For ALL user-visible text:**
1. **Add translation keys** to both `src/lib/i18n/locales/pl.json` and `en.json`
2. **Use descriptive key names**: `domain.section.specific_text`
3. **Polish is primary language** - make sure Polish translations are accurate
4. **Test both languages** - switch language in app settings

**Key naming convention:**
```json
{
  "common": {
    "save": "Zapisz",
    "cancel": "Anuluj",
    "delete": "Usuń"
  },
  "competitor": {
    "create": {
      "title": "Dodaj zawodnika",
      "button": "Dodaj"
    }
  },
  "errors": {
    "database": {
      "connection_failed": "Błąd połączenia z bazą danych"
    }
  }
}
```

---

## Pull Request Process

### Before Opening a PR

**Required:**
- [ ] Code compiles without warnings (`./check.sh` passes)
- [ ] All tests pass (`cargo test`)
- [ ] Frontend builds (`bun check` passes)
- [ ] Manual testing completed for changed functionality
- [ ] New user-visible text has Polish and English translations

**Good to have:**
- [ ] New unit tests for changed business logic
- [ ] Documentation updates for significant changes
- [ ] Performance testing for database-related changes

### PR Description Template

```markdown
## What Changed
Brief description of the changes and why they were needed.

## Testing Done
- [ ] Manual testing on Linux/Windows/macOS
- [ ] Unit tests added/updated
- [ ] Database migrations tested
- [ ] UI tested in both Polish and English

## Database Changes
- [ ] No schema changes
- [ ] New migration files created (not modified existing)
- [ ] Migration tested locally

## Breaking Changes
- [ ] No breaking changes
- [ ] Breaking changes documented with migration path
```

### Code Review Process

**What reviewers look for:**
1. **Follows established patterns** - doesn't introduce new architectural concepts
2. **Database safety** - uses compile-time SQLx macros, proper migrations
3. **Error handling** - proper `thiserror` error types and propagation
4. **i18n compliance** - all user-visible text is translatable
5. **Testing adequacy** - appropriate tests for the change complexity
6. **Documentation** - clear code comments and updated docs where needed

**Review timeline:**
- Small bug fixes: 1-2 days
- Feature additions: 3-7 days
- Large changes: May require discussion and iteration

---

## Getting Help

### Where to Ask Questions

**GitHub Issues:**
- Bug reports with reproducible steps
- Feature requests (discuss fit with project scope first)
- Build and setup problems
- Documentation improvements

**GitHub Discussions:**
- General questions about the codebase
- Architecture decisions and design discussions
- Powerlifting domain questions
- Getting started help

**Code Comments:**
- Most functions have clear documentation
- Architecture decisions explained in `docs/ARCHITECTURE.md`
- Database schema documented in migration files

### Common Development Issues

**Build Fails:**
```bash
# Clear all caches
rm -rf target/ node_modules/ dist/
bun install
./check.sh
```

**Database Issues:**
```bash
# Reset local database (development only - destroys data)
rm ~/.local/share/werewolf/werewolf.db
# App will recreate on next startup

# Check migration status
sqlite3 ~/.local/share/werewolf/werewolf.db "SELECT * FROM _sqlx_migrations;"
```

**SQLx Compile Errors:**
```bash
# Make sure DATABASE_URL is set
echo 'DATABASE_URL="sqlite:~/.local/share/werewolf/werewolf.db"' > src-tauri/.env

# Prepare queries for offline compilation
./prepare.sh
```

**Frontend Type Errors:**
```bash
# Check TypeScript
bun check

# Verify all translations exist
# Check that all $t('key.name') references have corresponding JSON entries
```

---

## Project Philosophy

**This app exists because existing powerlifting software is:**
- Expensive (hundreds of dollars per meet)
- Overcomplicated (designed by programmers, not meet directors)
- Internet-dependent (fails when gym WiFi is down)
- Feature-bloated (tries to do everything poorly)

**We're building the opposite:**
- **Free and open source** - no licensing fees
- **Simple and reliable** - does the core job perfectly
- **Offline-first** - works anywhere, anytime
- **Domain-focused** - built for powerlifting, by people who understand powerlifting

**Every contribution should serve meet directors who:**
- Run competitions on weekends in community gyms
- Need reliable software that doesn't fail at critical moments
- Want to focus on the competition, not fight with technology
- May not be highly technical but know powerlifting inside and out

**When in doubt, choose simplicity over features, reliability over complexity, and practical solutions over perfect abstractions.**

---

**Welcome to the project, and thank you for helping make powerlifting competitions run smoother!**