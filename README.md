# Werewolf - Powerlifting Contest Management

A Tauri-based desktop application for managing powerlifting contests with dual-window functionality.

## Overview

Werewolf is a simple CRUD application designed for powerlifting competitions, featuring:

- **Organizer Window**: Administrative interface for managing competitors, attempts, and contest flow
- **Display Window**: Full-screen presentation view for projecting results and current lifts to audiences
- **Real-time Updates**: Changes in the organizer window are immediately reflected on the display

## Architecture

- **Frontend**: Svelte with custom state management (no Redux/router) and full i18n (Polish/English)
- **Backend**: Rust with Tauri framework, SQLx for database operations, CLI support
- **Data**: SQLite database with compile-time verified queries and real-time sync
- **Federation**: Polish Powerlifting Federation compliant scoring system
- **Configuration**: XDG-compliant paths with TOML configuration files

## Quick Start

### Prerequisites
- **Rust** (latest stable)
- **Bun** (for frontend dependencies)
- **SQLite** (for database)

### NixOS Development
```bash
# Enter development environment with all dependencies
nix develop

# Install frontend dependencies
bun install

# Initialize database (first time setup)
cd src-tauri && cargo run -- db migrate

# Start development server
bun run tauri dev
```

### Other Platforms
```bash
# Install dependencies
bun install

# Initialize database (first time setup)
cd src-tauri
cargo run -- db migrate
cd ..

# Start development server  
bun run tauri dev
```

## Database Management

The application uses SQLite with SQLx migrations for schema management.

### Setup Database
```bash
# Navigate to Rust backend
cd src-tauri

# Run migrations to create/update database schema
cargo run -- db migrate

# Check migration status
cargo run -- db status

# Create database backup
cargo run -- db backup /path/to/backup.sqlite

# Reset database (WARNING: destroys all data)
cargo run -- db reset --confirm
```

### Development Database
- **Location**: `~/.local/share/werewolf/werewolf.db` (Linux) or platform equivalent
- **Schema**: Polish Powerlifting Federation compliant structure
- **Migrations**: Automatic on app startup, manual via CLI commands

## CLI Commands

After building the application, you can use these command-line features:

```bash
# Database operations
./werewolf db migrate          # Run pending migrations
./werewolf db status           # Show migration status
./werewolf db backup <path>    # Create database backup
./werewolf db reset --confirm  # Reset database (destroys data)

# Export functionality (coming soon)
./werewolf export contest-id csv   # Export results to CSV
./werewolf export contest-id excel # Export to Excel format

# GUI mode (default)
./werewolf                     # Start the GUI application
./werewolf gui                 # Explicitly start GUI mode
```

## Powerlifting Scoring System

The application uses authentic powerlifting federation scoring formulas:

### Reshel Coefficient
- **Purpose**: Normalizes lifts across different bodyweight classes for fair comparison
- **Usage**: Created by Greg Reshel for APF/WPC competitions
- **Formula**: `points = best_lift × reshel_coefficient × mccullough_coefficient`
- **Application**: Multiplies total weight lifted to create comparable scores across weight classes

### McCullough Coefficient  
- **Purpose**: Age adjustment factor for Master lifters (40+ years old)
- **Usage**: Applied in conjunction with bodyweight normalization (Reshel/Wilks/DOTS)
- **Application**: Accounts for natural strength decline with age in competition scoring
- **Note**: For Senior lifters, McCullough coefficient = 1.0 (no age adjustment)

### Scoring Logic
```
If all attempts failed (all negative weights):
  - Max Weight = 0
  - Points = 0
Else:
  - Max Weight = highest successful attempt
  - Points = max_weight × reshel_coeff × mccullough_coeff
```

### Competition Categories
- **Age Groups**: Junior (13/16/19/23), Senior, Veteran (40/50/60/70+)
- **Weight Classes**: Gender-specific ranges (e.g., "DO 75 KG", "+ 140 KG")
- **Equipment**: Raw, Equipped (T), Single-ply (SM), Multi-ply (M)

## Technology Stack

### Backend (Rust)
- **tauri**: Desktop application framework
- **sqlx**: Compile-time checked SQL queries with SQLite
- **chrono**: Date/time handling with timezone support
- **strum**: Enum string conversions and derive macros
- **serde + serde_json**: JSON serialization for API and configuration
- **thiserror**: Structured error handling with custom error types
- **tracing ecosystem**: Structured logging with file rotation
- **figment + toml**: Hierarchical configuration management
- **directories**: XDG Base Directory specification compliance
- **clap**: Command-line interface with subcommands

### Frontend (Svelte)
- **Svelte**: Reactive UI framework without virtual DOM
- **Custom stores**: Lightweight state management (no Redux complexity)
- **No routing**: Simple view switching based on window context
- **Frontend-only i18n**: Polish/English translation system
- **Tailwind CSS**: Utility-first CSS with powerlifting-specific design system
- **Bun**: All-in-one runtime (package manager + bundler + dev server)

### Development
- **SQLite**: Local database with federation-compliant schema
- **XDG directories**: Proper config/data/cache directory structure
- **CLI integration**: Database operations and export functionality

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer) + [Svelte](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode)
