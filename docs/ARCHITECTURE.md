# Werewolf Architecture

This document outlines the technical architecture for the Werewolf powerlifting contest management application.

## Design Principles

- **Backend-Heavy**: All business logic in Rust, frontend as "dumb views"
- **Database-Centric State**: Global state lives in SQLite database
- **Optimistic Updates**: Unidirectional flow (FE → Command → DB → Response)
- **Simplicity First**: Minimal, stable features for non-technical user (Andrzej)
- **No Real-time Sync**: Frontend never receives automatic updates from backend
- **Local Only**: No internet, cloud, or external sync requirements

## System Overview

```
┌─────────────────┐    ┌─────────────────┐
│  Main Window    │    │ Display Window  │
│   (Organizer)   │    │ (On-demand)     │
└─────────────────┘    └─────────────────┘
         │                       │
         └───────────┬───────────┘
                     │
         ┌─────────────────────┐
         │   Tauri Commands    │
         │  - Domain-based     │
         │  - Error handling   │
         └─────────────────────┘
                     │
         ┌─────────────────────┐
         │   Database Layer    │
         │  - SQLite/SQLx      │
         │  - Migrations       │
         │  - Query modules    │
         └─────────────────────┘
```

## Window Architecture

### Main Organizer Window
- **Purpose**: All contest management and CRUD operations
- **Layout**: Tile-based main view (settings, competitions)
- **Contest View**: Real-time editable table/dashboard
- **Display Control**: Button to open display window for current lifter
- **Always Open**: Primary window, never closes

### Display Window (On-Demand)
- **Purpose**: Show specific competitor's next lift information
- **Creation**: Created dynamically when needed during competition
- **Background**: Blank background (details TBD)
- **Updates**: No automatic updates - controlled from organizer window
- **Lifecycle**: Can be opened/closed as needed

## Database Schema

Based on Polish Powerlifting Federation requirements with registrations-based architecture:

### Core Tables

```sql
-- Contests
CREATE TABLE contests (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    date TEXT NOT NULL,
    location TEXT NOT NULL,
    discipline TEXT NOT NULL CHECK(discipline IN ('BenchPress', 'Squat', 'Deadlift', 'Powerlifting')),
    status TEXT NOT NULL DEFAULT 'Setup' CHECK(status IN ('Setup', 'InProgress', 'Paused', 'Completed')),
    federation_rules TEXT,
    competition_type TEXT,
    organizer TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Age Categories (pre-populated reference data)
CREATE TABLE age_categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    min_age INTEGER,
    max_age INTEGER
);

-- Weight Classes (pre-populated reference data) 
CREATE TABLE weight_classes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    gender TEXT NOT NULL CHECK(gender IN ('Male', 'Female')),
    min_weight REAL,
    max_weight REAL
);

-- Competitors (person data only)
CREATE TABLE competitors (
    id TEXT PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    birth_date TEXT NOT NULL,
    gender TEXT NOT NULL CHECK(gender IN ('Male', 'Female')),
    club TEXT,
    city TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Registrations (competitor at specific contest)
CREATE TABLE registrations (
    id TEXT PRIMARY KEY,
    contest_id TEXT NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
    competitor_id TEXT NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
    age_category_id TEXT REFERENCES age_categories(id),
    weight_class_id TEXT REFERENCES weight_classes(id),
    equipment_m BOOLEAN NOT NULL DEFAULT FALSE,
    equipment_sm BOOLEAN NOT NULL DEFAULT FALSE, 
    equipment_t BOOLEAN NOT NULL DEFAULT FALSE,
    bodyweight REAL NOT NULL,
    lot_number TEXT,
    personal_record_at_entry REAL,
    reshel_coefficient REAL,
    mccullough_coefficient REAL DEFAULT 1.0,
    rack_height_squat INTEGER,
    rack_height_bench INTEGER,
    opening_attempt_bench REAL,
    opening_attempt_squat REAL,
    opening_attempt_deadlift REAL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(contest_id, competitor_id)
);

-- Attempts (linked to registrations)
CREATE TABLE attempts (
    id TEXT PRIMARY KEY,
    registration_id TEXT NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
    lift_type TEXT NOT NULL CHECK(lift_type IN ('BenchPress', 'Squat', 'Deadlift')),
    attempt_number INTEGER NOT NULL CHECK(attempt_number IN (1, 2, 3)),
    weight REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending', 'Good', 'Failed', 'Skipped')),
    timestamp TEXT,
    judge1_decision BOOLEAN,
    judge2_decision BOOLEAN,
    judge3_decision BOOLEAN,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(registration_id, lift_type, attempt_number)
);

-- Results (calculated from attempts)
CREATE TABLE results (
    id TEXT PRIMARY KEY,
    registration_id TEXT NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
    contest_id TEXT NOT NULL,
    best_bench_press REAL DEFAULT 0,
    best_squat REAL DEFAULT 0,
    best_deadlift REAL DEFAULT 0,
    total_weight REAL NOT NULL DEFAULT 0,
    coefficient_points REAL NOT NULL DEFAULT 0,
    place_open INTEGER,
    place_in_age_class INTEGER,
    place_in_weight_class INTEGER,
    is_disqualified BOOLEAN NOT NULL DEFAULT FALSE,
    disqualification_reason TEXT,
    broke_record BOOLEAN NOT NULL DEFAULT FALSE,
    record_type TEXT,
    calculated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(registration_id)
);

-- Current lifts state (for competition flow)
CREATE TABLE current_lifts (
    id TEXT PRIMARY KEY,
    contest_id TEXT NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
    registration_id TEXT REFERENCES registrations(id),
    lift_type TEXT CHECK(lift_type IN ('BenchPress', 'Squat', 'Deadlift')),
    attempt_number INTEGER CHECK(attempt_number IN (1, 2, 3)),
    weight REAL,
    timer_started_at TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### Triple Ranking System

The database supports three simultaneous rankings per competitor:
- **Open Ranking**: Overall placement across all competitors
- **Age Category Ranking**: Placement within age group (Junior, Senior, Veteran, etc.)  
- **Weight Class Ranking**: Placement within weight division

## Backend Architecture

### Technology Stack
- **Framework**: Tauri 2.1 with Rust backend
- **Database**: SQLite with SQLx (compile-time verified queries)
- **Error Handling**: `thiserror` for structured error propagation
- **State Management**: `Arc<Mutex<AppState>>` with std library
- **Serialization**: Serde for JSON communication with frontend

### Module Structure

```
src-tauri/src/
├── main.rs              # CLI entry point
├── lib.rs               # Tauri app setup and command registration
├── commands/            # Domain-based Tauri commands
│   ├── mod.rs
│   ├── contests.rs      # contest_create, contest_list, etc.
│   ├── competitors.rs   # competitor_create, competitor_list, etc.
│   ├── registrations.rs # registration_create, registration_list, etc.
│   ├── attempts.rs      # attempt_record, attempt_list, etc.
│   ├── results.rs       # result_calculate, result_rankings, etc.
│   └── windows.rs       # window_open_display, window_close, etc.
├── database/
│   ├── mod.rs           # Database initialization
│   ├── connection.rs    # Pool management
│   ├── migrations.rs    # Migration runner
│   ├── db.rs           # Database struct and methods
│   └── queries/         # Query modules by domain
│       ├── contests.rs
│       ├── competitors.rs
│       ├── registrations.rs
│       ├── attempts.rs
│       ├── results.rs
│       └── categories.rs
└── error/
    └── mod.rs           # AppError with thiserror
```

### Command Architecture

All Tauri commands follow domain-based organization:

```rust
// Domain-based command naming
#[tauri::command]
async fn contest_create(state: State<'_, AppState>, request: CreateContestRequest) -> Result<Contest, AppError>

#[tauri::command] 
async fn contest_list(state: State<'_, AppState>) -> Result<Vec<Contest>, AppError>

#[tauri::command]
async fn competitor_register(state: State<'_, AppState>, request: CreateRegistrationRequest) -> Result<Registration, AppError>

#[tauri::command]
async fn attempt_record(state: State<'_, AppState>, request: CreateAttemptRequest) -> Result<Attempt, AppError>
```

### State Management

```rust
pub struct AppState {
    pub database: Arc<Database>,
}

impl AppState {
    pub async fn new() -> Result<Self, AppError> {
        let database = Arc::new(Database::new(&database_url).await?);
        Ok(Self { database })
    }
}

// Shared across all commands via Arc<Mutex<AppState>>
```

### Error Handling

```rust
#[derive(Error, Debug)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),
    
    #[error("Competitor not found: {id}")]
    CompetitorNotFound { id: String },
    
    #[error("Invalid attempt: {reason}")]
    InvalidAttempt { reason: String },
    
    #[error("Contest is not in progress")]
    ContestNotInProgress,
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where S: serde::Serializer {
        serializer.serialize_str(&self.to_string())
    }
}
```

## Frontend Architecture

### Technology Stack
- **Framework**: React 19 with TypeScript
- **Build Tool**: Vite with Tauri integration
- **Package Manager**: Bun
- **Styling**: TailwindCSS
- **State**: Local component state only (no global state management)

### Design Principles
- **Dumb Views**: No business logic in frontend
- **Domain Agnostic**: No knowledge of database implementation
- **Form State Only**: Temporary UI state managed locally
- **Command-based**: All data operations via Tauri commands

### Component Structure

```
src/
├── components/
│   ├── contests/
│   │   ├── ContestList.tsx
│   │   ├── ContestForm.tsx
│   │   └── ContestTile.tsx
│   ├── competitors/
│   │   ├── CompetitorList.tsx
│   │   ├── CompetitorForm.tsx
│   │   └── RegistrationForm.tsx
│   ├── attempts/
│   │   ├── AttemptTable.tsx
│   │   ├── AttemptForm.tsx
│   │   └── CurrentLift.tsx
│   └── windows/
│       └── DisplayWindow.tsx
├── views/
│   ├── MainView.tsx      # Tile-based navigation
│   ├── ContestView.tsx   # Contest management dashboard
│   └── DisplayView.tsx   # External display window
├── hooks/
│   └── useTauri.ts       # Tauri command wrappers
└── types/
    └── api.ts            # TypeScript types for API
```

### Data Flow

```
User Action → Form Submission → Tauri Command → Backend Logic → Database Update → Response → UI Update
```

**Key Points:**
- Frontend never receives automatic updates
- All data fetching triggered by user actions
- Optimistic updates with error handling
- No real-time synchronization between windows

## Migration System

### SQLx Integration
- **Compile-time verification**: All queries checked at build time
- **Embedded migrations**: Migration files embedded in binary
- **Automatic execution**: Migrations run on application startup
- **Version control**: Schema changes tracked through migration files

### Migration Files
```
src-tauri/migrations/
├── 20250823131642_initial_schema.sql  # Initial schema
└── [future migrations...]             # Schema evolution
```

### Migration Management
```rust
// Automatic migration on startup
pub async fn initialize_database() -> Result<DatabasePool, sqlx::Error> {
    let db_url = format!("sqlite:{}", get_database_path());
    
    if !Sqlite::database_exists(&db_url).await.unwrap_or(false) {
        Sqlite::create_database(&db_url).await?;
    }
    
    let pool = SqlitePool::connect(&db_url).await?;
    run_migrations(&pool).await?;  // Automatic migration
    
    Ok(pool)
}
```

## Window Management

### Window Creation
```rust
#[tauri::command]
async fn window_open_display(app: tauri::AppHandle) -> Result<(), AppError> {
    let window = tauri::WebviewWindowBuilder::new(
        &app,
        "display",
        tauri::WebviewUrl::App("index.html".into())
    )
    .title("Contest Display")
    .fullscreen(true)
    .build()?;
    
    Ok(())
}
```

### Window Communication
- **No automatic sync**: Display window controlled manually from organizer
- **Command-based updates**: Display refreshed via explicit commands
- **Window labels**: "main" for organizer, "display" for external display

## Performance & Reliability

### Database Optimization
- **Connection pooling**: SQLite connection pool for concurrent access
- **Indexed queries**: Proper indexing for competition data lookups
- **Transaction handling**: ACID compliance for attempt recording

### Frontend Performance
- **Lazy loading**: Load data only when needed
- **Optimistic updates**: UI updates immediately, rollback on error
- **Minimal re-renders**: React optimization patterns

### Error Recovery
- **Graceful degradation**: UI remains functional during errors
- **Data validation**: Input validation on both frontend and backend
- **Backup functionality**: Database backup before major operations

## Target User

**Primary User**: Andrzej (non-technical powerlifting club organizer)
- **Experience Level**: Non-technical user
- **Use Case**: Local powerlifting competitions
- **Requirements**: Simple, stable, hard to break
- **Environment**: Local gym competitions, no internet required

## Development Priorities

1. **Core Contest Flow**: Create contest → register competitors → run competition
2. **Simplicity**: Minimal features, intuitive interface
3. **Stability**: Robust error handling, data integrity
4. **Offline Operation**: No internet dependencies
5. **Cross-platform**: Linux primary, Windows secondary

## Future Considerations

### Potential Extensions
- **Import/Export**: CSV/Excel integration for federation compatibility
- **Multiple Competitions**: Historical contest management
- **Advanced Displays**: Multiple display configurations
- **Backup/Restore**: Enhanced data protection

### Technical Debt
- **Real-time Updates**: Future implementation of automatic window sync
- **Performance Scaling**: Optimization for larger competitions
- **UI/UX Polish**: Enhanced user experience features