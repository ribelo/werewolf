# Jules Development Plan - Werewolf Contest Management

## Executive Summary

Excellent work on the backend-frontend integration! You successfully wired up all the core CRUD operations and got real data flowing between frontend and backend. However, grug's review identified some critical issues that need immediate attention, plus there are exciting opportunities to build the remaining contest management features.

**Current Status**: ✅ Core CRUD complete, but with critical bugs that need fixes
**Next Goal**: Fix production crashes, then build contest flow management

---

## PHASE 1: CRITICAL FIXES (DO THIS FIRST) 🚨

**Priority**: BLOCKING - These will cause production crashes

### 1.1 Fix Enum Conversion Crashes
**Problem**: Lines 98, 101, 148, 151 in `attempts.rs` use `.unwrap()` on enum conversions
**Impact**: App crashes if database contains unexpected enum values

**Files to fix**:
- `src-tauri/src/commands/attempts.rs`

**Solution**:
```rust
// Replace this dangerous code:
lift_type: LiftType::from_str(&a.lift_type).unwrap(),

// With proper error handling:
lift_type: LiftType::from_str(&a.lift_type)
    .map_err(|_| AppError::Internal(format!("Invalid lift type: {}", a.lift_type)))?,
```

**Task checklist**:
- [ ] Fix attempt_list() enum conversions (lines 98, 101)
- [ ] Fix attempt_list_for_contest() enum conversions (lines 148, 151)
- [ ] Test with invalid database values to ensure no crashes
- [ ] Run `cargo test` to verify fixes

### 1.2 Fix Frontend-Backend Enum Mismatch
**Problem**: Frontend uses lowercase enum values, backend expects capitalized
**Impact**: Data corruption and inconsistent state

**Files to fix**:
- `src/lib/components/ContestView.svelte` (lines 30-40)
- `src-tauri/src/models/attempt.rs` (serde annotations)

**Solution**: Choose one format (recommend backend format) and update frontend to match:
```typescript
// In ContestView.svelte, change:
enum LiftType {
  Squat = 'squat',     // ❌ Wrong
  Bench = 'bench',     // ❌ Wrong  
  Deadlift = 'deadlift'// ❌ Wrong
}

// To:
enum LiftType {
  Squat = 'Squat',     // ✅ Matches backend
  Bench = 'Bench',     // ✅ Matches backend
  Deadlift = 'Deadlift'// ✅ Matches backend
}
```

**Task checklist**:
- [ ] Update frontend LiftType enum values
- [ ] Update frontend AttemptStatus enum values
- [ ] Test round-trip data flow (frontend → backend → frontend)
- [ ] Verify existing data still loads correctly

### 1.3 Replace Hardcoded Magic Strings
**Problem**: Lines 18-19 in `registrations.rs` use hardcoded strings
**Impact**: Breaks when real age categories/weight classes are needed

**Files to fix**:
- `src-tauri/src/commands/registrations.rs`
- `src-tauri/src/models/registration.rs`

**Solution**: Make these proper optional fields:
```rust
pub struct RegistrationCreate {
    pub contest_id: String,
    pub competitor_id: String,
    pub bodyweight: f64,
    pub age_category_id: Option<String>,    // Make optional
    pub weight_class_id: Option<String>,    // Make optional
}
```

**Task checklist**:
- [ ] Make age_category_id and weight_class_id optional in RegistrationCreate
- [ ] Update frontend to handle optional fields (default to None for now)
- [ ] Update database queries to handle None values
- [ ] Test registration flow still works

---

## PHASE 2: CORE CONTEST FEATURES 🏗️

**Priority**: HIGH - Essential for a working contest management system

### 2.1 Contest State Management
**Goal**: Track contest lifecycle (Setup → Registration → In Progress → Complete)

**New files to create**:
- `src-tauri/src/models/contest_state.rs`
- `src-tauri/src/commands/contest_state.rs`

**Features to implement**:
```rust
#[derive(Serialize, Deserialize, Type, Debug, Clone)]
pub enum ContestStatus {
    Setup,        // Setting up contest, no registrations yet
    Registration, // Accepting competitor registrations  
    InProgress,   // Contest running, tracking attempts
    Paused,       // Temporarily paused
    Complete,     // All attempts finished
}

#[derive(Serialize, Deserialize, Type, Debug, Clone)]
pub struct ContestState {
    pub contest_id: String,
    pub status: ContestStatus,
    pub current_lift: Option<LiftType>,
    pub current_round: i32, // 1st attempt, 2nd attempt, 3rd attempt
}
```

**Task checklist**:
- [ ] Create contest state model
- [ ] Add database table for contest_states
- [ ] Implement contest_state_get/update commands
- [ ] Add contest state display to frontend
- [ ] Add buttons to advance contest through phases

### 2.2 Current Attempt Management  
**Goal**: Track which lifter is "up next" and manage attempt ordering

**Features to implement**:
- Determine next lifter based on attempt number and weight
- Handle lifter progression through squat → bench → deadlift
- Manage attempt ordering (lowest weight goes first)

**New commands needed**:
```rust
#[tauri::command]
pub async fn attempt_get_current(contest_id: String) -> Result<Option<Attempt>, AppError>

#[tauri::command] 
pub async fn attempt_set_current(contest_id: String, attempt_id: String) -> Result<(), AppError>

#[tauri::command]
pub async fn attempt_get_next_in_queue(contest_id: String) -> Result<Vec<Attempt>, AppError>
```

**Task checklist**:
- [ ] Implement current attempt tracking in database
- [ ] Create attempt ordering logic (by weight, then registration order)
- [ ] Build "Next Up" queue display in frontend
- [ ] Add "Call Next Lifter" button functionality
- [ ] Handle edge cases (all attempts complete for a round)

### 2.3 Basic Scoring System
**Goal**: Calculate lifter totals and basic rankings

**Features to implement**:
- Calculate best successful attempt per lift
- Calculate total (squat + bench + deadlift)
- Rank lifters by total within weight class
- Handle failed attempts (0 total if any lift has 0)

**New files to create**:
- `src-tauri/src/models/results.rs`
- `src-tauri/src/commands/results.rs`

**Task checklist**:
- [ ] Create lifter results calculation
- [ ] Implement ranking logic
- [ ] Add results display to ContestView
- [ ] Show live leaderboard during contest
- [ ] Handle ties (same total weight)

---

## PHASE 3: USER EXPERIENCE IMPROVEMENTS 🎨

**Priority**: MEDIUM - Important for usability but not blocking

### 3.1 Display Window (Organizer → Presentation View)
**Goal**: Implement the dual-window architecture for displaying current lifter info

**Features to implement**:
- Separate window that shows current lifter details
- Updates when organizer advances to next lifter  
- Clean, large text for audience viewing
- Minimal, distraction-free design

**New files to create**:
- `src/lib/components/DisplayWindow.svelte`
- Update `src-tauri/src/lib.rs` with window management

**Task checklist**:
- [ ] Create display window component
- [ ] Implement window creation/management commands
- [ ] Add "Open Display Window" button to main view
- [ ] Design clean presentation layout
- [ ] Test window synchronization

### 3.2 Enhanced Error Handling & Validation
**Goal**: Make the app more robust and user-friendly

**Improvements needed**:
- Frontend form validation before submitting
- Better error messages for users (not technical errors)
- Graceful handling of database connection issues
- Input sanitization and validation

**Task checklist**:
- [ ] Add form validation to competitor creation
- [ ] Add bodyweight validation (positive numbers only)
- [ ] Improve error message display in UI
- [ ] Add loading states for async operations
- [ ] Handle network/database timeouts gracefully

### 3.3 Reduce Code Duplication  
**Goal**: Clean up the codebase based on grug's feedback

**Issues to address**:
- Database pool boilerplate in every command
- Repetitive error handling patterns
- Similar data transformation logic

**Refactoring tasks**:
- [ ] Create database helper function for pool access
- [ ] Extract common error handling patterns
- [ ] Consolidate similar data mapping logic
- [ ] Review and remove unused imports

---

## PHASE 4: ADVANCED FEATURES 🚀

**Priority**: LOW - Nice to have, implement after core system is solid

### 4.1 Data Import/Export
**Goal**: Make it easy to get data in and out of the system

**Features to implement**:
- CSV import for competitor lists
- Results export for record keeping
- Backup/restore functionality
- Print-friendly results format

### 4.2 Contest Settings & Configuration
**Goal**: Make the system configurable for different contest types

**Features to implement**:
- Configure attempt time limits
- Set up weight classes and age categories
- Equipment categories (raw, equipped, etc.)
- Competition rules (3 attempts vs 4, etc.)

### 4.3 Performance Optimizations
**Goal**: Handle larger contests efficiently

**Improvements needed**:
- Batch database operations
- Frontend pagination for large competitor lists
- Optimize re-renders on state changes
- Background data synchronization

---

## DEVELOPMENT WORKFLOW

### Before Starting Any Phase:
1. **Read the current CLAUDE.md** - Understand project structure and conventions
2. **Run tests**: `cd src-tauri && cargo test`  
3. **Check compilation**: `cargo check && cargo clippy`
4. **Create feature branch**: `git checkout -b feat/your-feature-name`

### While Working:
1. **Test as you go** - Don't accumulate untested code
2. **Follow existing patterns** - Look at current code style and match it
3. **Keep commits small** - One logical change per commit
4. **Write descriptive commit messages**

### Before Submitting:
1. **Fix all clippy warnings**: `cargo clippy -- -D warnings`
2. **Format code**: `cargo fmt`  
3. **Run full test suite**: `cargo test`
4. **Test the UI manually** - Make sure features actually work
5. **Request code review** - Don't merge without review

---

## QUESTIONS FOR CLARIFICATION

Before diving into Phase 2, consider these questions:

1. **Contest Rules**: How many attempts per lift? (Standard is 3)
2. **Weight Classes**: Should we implement standard powerlifting weight classes?
3. **Age Categories**: Do we need junior/open/masters divisions?
4. **Equipment**: Raw only, or multiple equipment categories?
5. **Scoring**: Just highest total, or also individual lift records?

## SUCCESS METRICS

You'll know you're successful when:

**Phase 1**: ✅ No more `.unwrap()` crashes, consistent enum handling
**Phase 2**: ✅ Can run a complete contest from start to finish  
**Phase 3**: ✅ Non-technical user (Andrzej) can use it without confusion
**Phase 4**: ✅ System handles real-world contest scenarios efficiently

---

**Remember**: This is a marathon, not a sprint. Focus on getting Phase 1 rock-solid before moving to Phase 2. Better to have fewer features that work perfectly than many features that are buggy.

Good luck, and great work on the foundation! 🚀