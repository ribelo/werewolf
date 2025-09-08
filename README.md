# Werewolf - Powerlifting Contest Management

**A rock-solid, offline desktop application for powerlifting meet directors who need simple, reliable contest management without the complexity overhead.**

**What it does**: Manages competitors, tracks attempts, calculates results, and displays rankings with dual-window architecture for both organizers and spectators.

**What it doesn't do**: Timer management, federation uploads, judge scoring, complex validation rules, or anything that gets in the way of running your meet.

---

## For Meet Directors (Users)

### What You Get

**Core Features:**
- **Competitor Registration**: Add competitors with photos, weight classes, and categories
- **Attempt Tracking**: Record squat, bench, deadlift attempts (good/bad, no complexity)
- **Real-time Results**: Automatic calculation with Reshel coefficients and age adjustments
- **Dual Display System**: Organizer interface + full-screen display for spectators
- **Data Export**: Results to Excel/CSV for record-keeping and federation submissions
- **Bulletproof Offline**: No internet required, no cloud dependencies, no subscription fees

**What Makes This Different:**
- **No bullshit complexity** - Built specifically for meet directors, not software engineers
- **Handles the mess** - Edit anything, fix mistakes, works with real-world chaos
- **Actually works offline** - Your meet won't fail because WiFi is down
- **Polish/English support** - Built for Polish Powerlifting Federation standards

### Installation

**Download the latest release from GitHub:**
- **Windows**: Download `.msi` installer, run it, ignore SmartScreen warning (click "More info" → "Run anyway")
- **macOS**: Download `.dmg`, open it, ignore "unidentified developer" (right-click app → "Open" → "Open")
- **Linux**: Download `.deb` (Ubuntu/Debian) or `.AppImage` (universal), install/run directly

**First time setup warnings are normal** - after the first run, your OS will remember the app is safe.

### Quick Start Guide

1. **Create Contest**: Enter basic details (name, date, location)
2. **Register Competitors**: Add one-by-one or import from CSV
3. **Open Display Window**: Click "Display" to show results to spectators
4. **Track Attempts**: Mark lifts as successful/failed, results update automatically
5. **Export Results**: Generate Excel/CSV reports when done

**Database Location**: `~/.local/share/werewolf/werewolf.db` (Linux), similar paths on Windows/macOS

---

## For Developers

### Technology Architecture

**Why These Choices:**
- **Tauri + Rust**: Native performance, small binaries, no Electron bloat
- **SQLite**: Bulletproof local database, no server complexity
- **Svelte**: Fast, lightweight frontend without React overhead
- **No cloud dependencies**: Meets happen in gyms with shit WiFi

**Stack:**
- **Backend**: Rust with Tauri 2.8, SQLx for compile-time verified queries
- **Frontend**: Svelte 5.38 with TypeScript, Tailwind CSS
- **Database**: SQLite with automatic migrations
- **Build**: GitHub Actions for Windows/macOS/Linux releases
- **Package Manager**: Bun (faster than npm/yarn)

### Development Setup

**Prerequisites:**
- Rust (latest stable)
- Bun (package manager)
- SQLite
- Git

**Clone and run:**
```bash
# Clone repository
git clone <repository-url>
cd werewolf

# Install dependencies
bun install

# Start development (frontend + backend hot reload)
bun run tauri dev
```

**NixOS users:**
```bash
# Enter development shell with all dependencies
nix develop
bun install
bun run tauri dev
```

### Project Structure

```
werewolf/
├── src/                    # Svelte frontend
│   ├── lib/components/     # UI components
│   ├── lib/i18n/          # Polish/English translations
│   └── lib/stores.ts       # State management
├── src-tauri/              # Rust backend
│   ├── src/commands/       # Tauri command handlers
│   ├── src/database/       # Database layer
│   ├── src/models/         # Data structures
│   └── migrations/         # SQLite schema migrations
├── .github/workflows/      # CI/CD for releases
└── docs/                   # Architecture documentation
```

### Key Development Principles

1. **Backend-Heavy Architecture**: All business logic in Rust, frontend as "dumb views"
2. **Database as State**: SQLite holds all application state, no in-memory complexity
3. **Command-Based**: Frontend calls domain commands (`contest_create`, `competitor_register`)
4. **Optimistic Updates**: No real-time sync, no WebSockets, no event streams
5. **Simplicity First**: Built for reliability, not feature completeness

### Building and Testing

```bash
# Run all Rust checks (formatting, linting, tests)
./check.sh

# Frontend type checking
bun run check

# Build production release
bun run tauri build

# Database operations
cd src-tauri
cargo run -- db migrate    # Run migrations
cargo run -- db backup     # Create backup
cargo run -- db status     # Check migration status
```

### Database Development

**Critical Rules:**
- **Use SQLx compile-time macros** (`query!()`, `query_as!()`) - never runtime queries
- **Never modify existing migrations** - always create new migration files
- **Test migrations locally** before committing

**Working with migrations:**
```bash
# Create new migration
sqlx migrate add descriptive_name

# Apply migrations
cargo run -- db migrate

# Reset database (development only - destroys data)
rm ~/.local/share/werewolf/werewolf.db
```

### Internationalization

**All user-facing text must be translatable:**
- ❌ `<button>Save</button>`
- ✅ `<button>{$t('common.save')}</button>`

**Translation files:**
- `src/lib/i18n/locales/pl.json` - Polish (primary)
- `src/lib/i18n/locales/en.json` - English

### Contributing Guidelines

1. **Read existing code** - follow established patterns
2. **Test your changes** - run `./check.sh` before committing
3. **Keep it simple** - this is intentionally not a complex system
4. **No feature creep** - check `REQUIREMENTS_AND_ROADMAP.md` for scope
5. **Document breaking changes** - especially database schema changes

See `CONTRIBUTING.md` for detailed contribution guidelines.

---

## Powerlifting Scoring System

Built for **Polish Powerlifting Federation** standards with authentic scoring:

**Reshel Coefficient**: Normalizes lifts across bodyweight classes (APF/WPC standard)
**McCullough Coefficient**: Age adjustments for Master lifters (40+ years)
**Scoring Formula**: `points = total_weight × reshel_coefficient × mccullough_coefficient`

**Competition Categories:**
- **Age Groups**: Junior (13/16/19/23), Senior, Veteran (40/50/60/70+)
- **Weight Classes**: Gender-specific ("DO 75 KG", "+ 140 KG")
- **Equipment**: Raw, Equipped (T), Single-ply (SM), Multi-ply (M)

**Results Logic:**
- Failed attempts = 0 points (all negative weights)
- Successful attempts = highest successful lift counts toward total
- Ties broken by earliest successful attempt (or body weight)

---

## Release Information

**Current Version**: 0.1.0 (active development)
**Supported Platforms**: Windows 10/11, macOS (Intel/ARM), Linux (Ubuntu 20.04+)
**Release Schedule**: Tagged releases trigger automatic builds via GitHub Actions
**Code Signing**: None (expect OS warnings on first run - this is normal)

**Getting Updates:**
- Watch this repository for release notifications
- Download latest `.msi`/`.dmg`/`.deb` from Releases page
- Automatic updates coming in future versions

---

## Support and Documentation

**User Documentation**:
- **Quick Start Guide**: This README
- **Detailed Manual**: `docs/USER_GUIDE.md` (coming soon)
- **FAQ**: `docs/FAQ.md` (coming soon)

**Developer Documentation**:
- **Architecture**: `docs/ARCHITECTURE.md`
- **API Reference**: Generated from Rust docs
- **Project Instructions**: `CLAUDE.md`
- **Contributing Guide**: `CONTRIBUTING.md`

**Getting Help**:
- **Issues**: Report bugs via GitHub Issues
- **Questions**: Start a GitHub Discussion
- **Polish Language Support**: Native support, documentation in progress

**This app exists because existing powerlifting software is either expensive, overcomplicated, or requires internet connection. We built something that just works.**