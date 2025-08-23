use sqlx::{Pool, Sqlite, Row};
use std::sync::Arc;
use serde::{Deserialize, Serialize};

// Import all query modules
use crate::database::queries::*;

/// Main database abstraction that holds the connection pool and provides
/// high-level methods for all database operations
#[derive(Clone)]
pub struct Database {
    pool: Arc<Pool<Sqlite>>,
}

impl Database {
    /// Create a new Database instance with automatic migration
    pub async fn new(database_url: &str) -> Result<Self, sqlx::Error> {
        let pool = crate::database::connection::create_pool(database_url).await?;
        
        // Run migrations
        crate::database::migrations::run_migrations(&pool).await?;
        
        // Test connection
        crate::database::connection::test_connection(&pool).await?;
        
        Ok(Self {
            pool: Arc::new(pool),
        })
    }

    /// Create Database from existing pool
    pub fn from_pool(pool: Pool<Sqlite>) -> Self {
        Self {
            pool: Arc::new(pool),
        }
    }

    /// Get reference to the underlying pool
    pub fn pool(&self) -> &Pool<Sqlite> {
        &self.pool
    }

    /// Check database health
    pub async fn health_check(&self) -> Result<(), sqlx::Error> {
        crate::database::check_database_health(&self.pool).await
    }

    // =============================================================================
    // CONTEST MANAGEMENT
    // =============================================================================

    /// Create a new contest
    pub async fn create_contest(&self, request: CreateContestRequest) -> Result<Contest, sqlx::Error> {
        contests::create_contest(&self.pool, request).await
    }

    /// Get contest by ID
    pub async fn get_contest(&self, contest_id: &str) -> Result<Contest, sqlx::Error> {
        contests::get_contest_by_id(&self.pool, contest_id).await
    }

    /// Get all contests (including archived)
    pub async fn get_all_contests(&self) -> Result<Vec<Contest>, sqlx::Error> {
        contests::get_all_contests(&self.pool).await
    }

    /// Get active (non-archived) contests only
    pub async fn get_active_contests(&self) -> Result<Vec<Contest>, sqlx::Error> {
        let contests = contests::get_all_contests(&self.pool).await?;
        Ok(contests.into_iter().filter(|c| !c.is_archived).collect())
    }

    /// Update contest status
    pub async fn update_contest_status(&self, contest_id: &str, status: &str) -> Result<(), sqlx::Error> {
        contests::update_contest_status(&self.pool, contest_id, status).await
    }

    /// Archive contest (soft delete)
    pub async fn archive_contest(&self, contest_id: &str) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE contests SET is_archived = TRUE WHERE id = ?1")
            .bind(contest_id)
            .execute(&*self.pool)
            .await?;
        Ok(())
    }

    /// Delete contest (hard delete)
    pub async fn delete_contest(&self, contest_id: &str) -> Result<(), sqlx::Error> {
        contests::delete_contest(&self.pool, contest_id).await
    }

    // =============================================================================
    // COMPETITOR MANAGEMENT
    // =============================================================================

    /// Create a new competitor
    pub async fn create_competitor(&self, request: CreateCompetitorRequest) -> Result<Competitor, sqlx::Error> {
        competitors::create_competitor(&self.pool, request).await
    }

    /// Get competitor by ID
    pub async fn get_competitor(&self, competitor_id: &str) -> Result<Competitor, sqlx::Error> {
        competitors::get_competitor_by_id(&self.pool, competitor_id).await
    }

    /// Get all competitors
    pub async fn get_all_competitors(&self) -> Result<Vec<Competitor>, sqlx::Error> {
        competitors::get_all_competitors(&self.pool).await
    }

    /// Search competitors by name
    pub async fn search_competitors(&self, search_term: &str) -> Result<Vec<Competitor>, sqlx::Error> {
        let pattern = format!("%{}%", search_term);
        let rows = sqlx::query(
            "SELECT id, first_name, last_name, birth_date, gender, club, city, notes, created_at, updated_at 
             FROM competitors 
             WHERE first_name LIKE ?1 OR last_name LIKE ?1 OR club LIKE ?1
             ORDER BY last_name, first_name"
        )
        .bind(&pattern)
        .fetch_all(&*self.pool)
        .await?;

        let mut competitors = Vec::new();
        for row in rows {
            competitors.push(Competitor {
                id: row.try_get("id")?,
                first_name: row.try_get("first_name")?,
                last_name: row.try_get("last_name")?,
                birth_date: row.try_get("birth_date")?,
                gender: row.try_get("gender")?,
                club: row.try_get("club")?,
                city: row.try_get("city")?,
                notes: row.try_get("notes")?,
                created_at: row.try_get("created_at")?,
                updated_at: row.try_get("updated_at")?,
            });
        }
        
        Ok(competitors)
    }

    /// Update competitor
    pub async fn update_competitor(&self, competitor_id: &str, request: CreateCompetitorRequest) -> Result<(), sqlx::Error> {
        competitors::update_competitor(&self.pool, competitor_id, request).await
    }

    /// Delete competitor
    pub async fn delete_competitor(&self, competitor_id: &str) -> Result<(), sqlx::Error> {
        competitors::delete_competitor(&self.pool, competitor_id).await
    }

    // =============================================================================
    // REGISTRATION MANAGEMENT
    // =============================================================================

    /// Register a competitor for a contest
    pub async fn register_competitor(&self, request: CreateRegistrationRequest) -> Result<Registration, sqlx::Error> {
        registrations::create_registration(&self.pool, request).await
    }

    /// Get registration by ID
    pub async fn get_registration(&self, registration_id: &str) -> Result<Registration, sqlx::Error> {
        registrations::get_registration_by_id(&self.pool, registration_id).await
    }

    /// Get all registrations for a contest
    pub async fn get_contest_registrations(&self, contest_id: &str) -> Result<Vec<Registration>, sqlx::Error> {
        registrations::get_registrations_by_contest(&self.pool, contest_id).await
    }

    /// Get registration with competitor details
    pub async fn get_registration_with_competitor(&self, registration_id: &str) -> Result<(Registration, Competitor), sqlx::Error> {
        let registration = self.get_registration(registration_id).await?;
        let competitor = self.get_competitor(&registration.competitor_id).await?;
        Ok((registration, competitor))
    }

    /// Update registration
    pub async fn update_registration(&self, registration_id: &str, request: CreateRegistrationRequest) -> Result<(), sqlx::Error> {
        registrations::update_registration(&self.pool, registration_id, request).await
    }

    /// Delete registration
    pub async fn delete_registration(&self, registration_id: &str) -> Result<(), sqlx::Error> {
        registrations::delete_registration(&self.pool, registration_id).await
    }

    // =============================================================================
    // CATEGORY MANAGEMENT
    // =============================================================================

    /// Get all age categories
    pub async fn get_age_categories(&self) -> Result<Vec<AgeCategory>, sqlx::Error> {
        let rows = sqlx::query("SELECT id, name, min_age, max_age FROM age_categories ORDER BY min_age")
            .fetch_all(&*self.pool)
            .await?;

        let mut categories = Vec::new();
        for row in rows {
            categories.push(AgeCategory {
                id: row.try_get("id")?,
                name: row.try_get("name")?,
                min_age: row.try_get("min_age")?,
                max_age: row.try_get("max_age")?,
            });
        }
        
        Ok(categories)
    }

    /// Get all weight classes for a gender
    pub async fn get_weight_classes(&self, gender: &str) -> Result<Vec<WeightClass>, sqlx::Error> {
        let rows = sqlx::query("SELECT id, gender, name, weight_min, weight_max FROM weight_classes WHERE gender = ?1 ORDER BY weight_max")
            .bind(gender)
            .fetch_all(&*self.pool)
            .await?;

        let mut classes = Vec::new();
        for row in rows {
            classes.push(WeightClass {
                id: row.try_get("id")?,
                gender: row.try_get("gender")?,
                name: row.try_get("name")?,
                weight_min: row.try_get("weight_min")?,
                weight_max: row.try_get("weight_max")?,
            });
        }
        
        Ok(classes)
    }

    /// Determine age category based on birth date and contest date
    pub async fn determine_age_category(&self, birth_date: &str, contest_date: &str) -> Result<Option<String>, sqlx::Error> {
        // Calculate age as of contest date
        let age = self.calculate_age(birth_date, contest_date)?;
        
        let categories = self.get_age_categories().await?;
        for category in categories {
            let min_age = category.min_age.unwrap_or(0);
            let max_age = category.max_age.unwrap_or(150);
            
            if age >= min_age && age <= max_age {
                return Ok(Some(category.id));
            }
        }
        
        Ok(None)
    }

    /// Determine weight class based on bodyweight and gender
    pub async fn determine_weight_class(&self, bodyweight: f64, gender: &str) -> Result<Option<String>, sqlx::Error> {
        let classes = self.get_weight_classes(gender).await?;
        
        for class in classes {
            let min_weight = class.weight_min.unwrap_or(0.0);
            let max_weight = class.weight_max.unwrap_or(f64::MAX);
            
            if bodyweight > min_weight && bodyweight <= max_weight {
                return Ok(Some(class.id));
            }
        }
        
        Ok(None)
    }

    /// Calculate age based on birth date and contest date
    fn calculate_age(&self, birth_date: &str, contest_date: &str) -> Result<i32, sqlx::Error> {
        // Simple age calculation - in production you'd want more robust date parsing
        let birth_year: i32 = birth_date[0..4].parse()
            .map_err(|_| sqlx::Error::Protocol("Invalid birth_date format".into()))?;
        let contest_year: i32 = contest_date[0..4].parse()
            .map_err(|_| sqlx::Error::Protocol("Invalid contest_date format".into()))?;
        
        Ok(contest_year - birth_year)
    }
}

// =============================================================================
// HELPER STRUCTS
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgeCategory {
    pub id: String,
    pub name: String,
    pub min_age: Option<i32>,
    pub max_age: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WeightClass {
    pub id: String,
    pub gender: String,
    pub name: String,
    pub weight_min: Option<f64>,
    pub weight_max: Option<f64>,
}

// =============================================================================
// TESTS
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;

    /// Create a temporary test database
    async fn create_test_db() -> Database {
        let temp_file = NamedTempFile::new().expect("Failed to create temp file");
        let db_path = temp_file.into_temp_path();
        
        // Add UUID to make it more unique
        let unique_id = uuid::Uuid::new_v4();
        let db_url = format!("sqlite:{}_{}", db_path.to_string_lossy(), unique_id);
        
        Database::new(&db_url).await.expect("Failed to create test database")
    }

    #[tokio::test]
    async fn test_database_creation_and_health_check() {
        let db = create_test_db().await;
        
        // Health check should pass
        assert!(db.health_check().await.is_ok());
    }

    #[tokio::test]
    async fn test_contest_crud_operations() {
        let db = create_test_db().await;

        // Create contest
        let contest = db.create_contest(CreateContestRequest {
            name: "Test Competition".to_string(),
            date: "2025-01-15".to_string(),
            location: "Test Location".to_string(),
            discipline: "BenchPress".to_string(),
            federation_rules: None, // Test nullable federation
            competition_type: Some("Regional".to_string()),
            organizer: Some("Test Org".to_string()),
            notes: None,
        }).await.expect("Failed to create contest");

        assert_eq!(contest.name, "Test Competition");
        assert_eq!(contest.federation_rules, None);
        assert!(!contest.is_archived);

        // Get contest by ID
        let fetched = db.get_contest(&contest.id).await.expect("Failed to get contest");
        assert_eq!(fetched.id, contest.id);
        assert_eq!(fetched.name, contest.name);

        // Update status
        db.update_contest_status(&contest.id, "InProgress").await
            .expect("Failed to update status");

        let updated = db.get_contest(&contest.id).await.expect("Failed to get updated contest");
        assert_eq!(updated.status, "InProgress");

        // Archive contest
        db.archive_contest(&contest.id).await.expect("Failed to archive");
        
        let archived = db.get_contest(&contest.id).await.expect("Failed to get archived contest");
        assert!(archived.is_archived);

        // Get active contests should not include archived
        let active = db.get_active_contests().await.expect("Failed to get active contests");
        assert!(!active.iter().any(|c| c.id == contest.id));

        // Get all contests should include archived
        let all = db.get_all_contests().await.expect("Failed to get all contests");
        assert!(all.iter().any(|c| c.id == contest.id));
    }

    #[tokio::test]
    async fn test_competitor_management() {
        let db = create_test_db().await;

        // Create competitor
        let competitor = db.create_competitor(CreateCompetitorRequest {
            first_name: "John".to_string(),
            last_name: "Doe".to_string(),
            birth_date: "1990-05-15".to_string(),
            gender: "Male".to_string(),
            club: Some("Test Club".to_string()),
            city: Some("Test City".to_string()),
            notes: None,
        }).await.expect("Failed to create competitor");

        assert_eq!(competitor.first_name, "John");
        assert_eq!(competitor.last_name, "Doe");
        assert_eq!(competitor.birth_date, "1990-05-15");

        // Search competitors
        let search_results = db.search_competitors("John")
            .await.expect("Failed to search competitors");
        assert_eq!(search_results.len(), 1);
        assert_eq!(search_results[0].id, competitor.id);

        // Update competitor
        db.update_competitor(&competitor.id, CreateCompetitorRequest {
            first_name: "Jane".to_string(),
            last_name: "Doe".to_string(),
            birth_date: "1990-05-15".to_string(),
            gender: "Female".to_string(),
            club: Some("New Club".to_string()),
            city: Some("New City".to_string()),
            notes: Some("Updated".to_string()),
        }).await.expect("Failed to update competitor");

        let updated = db.get_competitor(&competitor.id)
            .await.expect("Failed to get updated competitor");
        assert_eq!(updated.first_name, "Jane");
        assert_eq!(updated.gender, "Female");
        assert_eq!(updated.club, Some("New Club".to_string()));
    }

    #[tokio::test]
    async fn test_registration_with_categories() {
        let db = create_test_db().await;

        // Create contest
        let contest = db.create_contest(CreateContestRequest {
            name: "Test Contest".to_string(),
            date: "2025-01-15".to_string(),
            location: "Test".to_string(),
            discipline: "BenchPress".to_string(),
            federation_rules: None,
            competition_type: None,
            organizer: None,
            notes: None,
        }).await.expect("Failed to create contest");

        // Create competitor
        let competitor = db.create_competitor(CreateCompetitorRequest {
            first_name: "Test".to_string(),
            last_name: "Lifter".to_string(),
            birth_date: "1985-06-15".to_string(), // Will be 40 in 2025 = VETERAN40
            gender: "Male".to_string(),
            club: None,
            city: None,
            notes: None,
        }).await.expect("Failed to create competitor");

        // Register competitor
        let registration = db.register_competitor(CreateRegistrationRequest {
            contest_id: contest.id.clone(),
            competitor_id: competitor.id.clone(),
            age_category_id: "VETERAN40".to_string(),
            weight_class_id: "M_140_PLUS".to_string(),
            equipment_m: false,
            equipment_sm: false,
            equipment_t: true, // Equipped
            bodyweight: 145.5,
            lot_number: Some("1".to_string()),
            personal_record_at_entry: Some(250.0),
            reshel_coefficient: Some(0.5550),
            mccullough_coefficient: Some(1.1), // Age coefficient
            rack_height_squat: None,
            rack_height_bench: Some(10),
        }).await.expect("Failed to register competitor");

        assert_eq!(registration.bodyweight, 145.5);
        assert!(registration.equipment_t);
        assert!(!registration.equipment_m);
        assert!(!registration.equipment_sm);

        // Get registration with competitor
        let (reg, comp) = db.get_registration_with_competitor(&registration.id)
            .await.expect("Failed to get registration with competitor");
        assert_eq!(reg.id, registration.id);
        assert_eq!(comp.id, competitor.id);

        // Get contest registrations
        let registrations = db.get_contest_registrations(&contest.id)
            .await.expect("Failed to get contest registrations");
        assert_eq!(registrations.len(), 1);
        assert_eq!(registrations[0].id, registration.id);
    }

    #[tokio::test]
    async fn test_category_determination() {
        let db = create_test_db().await;

        // Test age category determination
        let age_category = db.determine_age_category("1985-06-15", "2025-01-15")
            .await.expect("Failed to determine age category");
        assert_eq!(age_category, Some("VETERAN40".to_string())); // 40 years old = VETERAN40

        let age_category2 = db.determine_age_category("1984-06-15", "2025-01-15")
            .await.expect("Failed to determine age category");
        assert_eq!(age_category2, Some("VETERAN40".to_string())); // 40 years old = VETERAN40

        // Test weight class determination
        let weight_class = db.determine_weight_class(145.5, "Male")
            .await.expect("Failed to determine weight class");
        assert_eq!(weight_class, Some("M_140_PLUS".to_string())); // Over 140kg

        let weight_class2 = db.determine_weight_class(89.5, "Male")
            .await.expect("Failed to determine weight class");
        assert_eq!(weight_class2, Some("M_90".to_string())); // Under 90kg

        let weight_class3 = db.determine_weight_class(65.0, "Female")
            .await.expect("Failed to determine weight class");
        assert_eq!(weight_class3, Some("F_72".to_string())); // Female 63-72kg
    }

    #[tokio::test]
    async fn test_attempts_and_results() {
        let db = create_test_db().await;
        use crate::database::queries::*;

        // Setup: Create contest, competitor, and registration
        let contest = db.create_contest(CreateContestRequest {
            name: "Test Competition".to_string(),
            date: "2025-01-15".to_string(),
            location: "Test".to_string(),
            discipline: "BenchPress".to_string(),
            federation_rules: None,
            competition_type: None,
            organizer: None,
            notes: None,
        }).await.expect("Failed to create contest");

        let competitor = db.create_competitor(CreateCompetitorRequest {
            first_name: "Strong".to_string(),
            last_name: "Lifter".to_string(),
            birth_date: "1990-01-01".to_string(),
            gender: "Male".to_string(),
            club: None,
            city: None,
            notes: None,
        }).await.expect("Failed to create competitor");

        let registration = db.register_competitor(CreateRegistrationRequest {
            contest_id: contest.id.clone(),
            competitor_id: competitor.id.clone(),
            age_category_id: "SENIOR".to_string(),
            weight_class_id: "M_100".to_string(),
            equipment_m: false,
            equipment_sm: false,
            equipment_t: false, // Raw
            bodyweight: 98.5,
            lot_number: Some("1".to_string()),
            personal_record_at_entry: Some(180.0),
            reshel_coefficient: Some(0.6200),
            mccullough_coefficient: Some(1.0),
            rack_height_squat: None,
            rack_height_bench: Some(8),
        }).await.expect("Failed to register");

        // Record attempts (simulating competition)
        // Attempt 1: Good lift
        let _attempt1 = attempts::record_attempt(db.pool(), CreateAttemptRequest {
            registration_id: registration.id.clone(),
            lift_type: "BenchPress".to_string(),
            attempt_number: 1,
            weight: 160.0,
            status: Some("Good".to_string()),
            judge1_decision: Some(true),
            judge2_decision: Some(true),
            judge3_decision: Some(true),
            notes: None,
        }).await.expect("Failed to record attempt 1");

        // Attempt 2: Failed lift
        let _attempt2 = attempts::record_attempt(db.pool(), CreateAttemptRequest {
            registration_id: registration.id.clone(),
            lift_type: "BenchPress".to_string(),
            attempt_number: 2,
            weight: 170.0,
            status: Some("Failed".to_string()),
            judge1_decision: Some(false),
            judge2_decision: Some(true),
            judge3_decision: Some(false),
            notes: Some("Lost balance".to_string()),
        }).await.expect("Failed to record attempt 2");

        // Attempt 3: Good lift
        let _attempt3 = attempts::record_attempt(db.pool(), CreateAttemptRequest {
            registration_id: registration.id.clone(),
            lift_type: "BenchPress".to_string(),
            attempt_number: 3,
            weight: 165.0,
            status: Some("Good".to_string()),
            judge1_decision: Some(true),
            judge2_decision: Some(true),
            judge3_decision: Some(true),
            notes: None,
        }).await.expect("Failed to record attempt 3");

        // Get attempts for registration
        let attempts = attempts::get_attempts_by_registration(db.pool(), &registration.id)
            .await.expect("Failed to get attempts");
        assert_eq!(attempts.len(), 3);
        assert_eq!(attempts[0].weight, 160.0);
        assert_eq!(attempts[0].status, "Good");

        // Get best attempt
        let best = attempts::get_best_attempt(db.pool(), &registration.id, "BenchPress")
            .await.expect("Failed to get best attempt");
        assert_eq!(best, Some(165.0)); // Best successful attempt

        // Calculate results
        let result = results::calculate_results(db.pool(), &registration.id)
            .await.expect("Failed to calculate results");
        assert_eq!(result.best_bench_press, Some(165.0));
        assert_eq!(result.total_weight, 165.0); // Only bench press
        assert_eq!(result.coefficient_points, 165.0 * 0.6200 * 1.0); // weight * reshel * mccullough
    }

    #[tokio::test]
    async fn test_triple_ranking_system() {
        let db = create_test_db().await;
        use crate::database::queries::*;

        // Create contest
        let contest = db.create_contest(CreateContestRequest {
            name: "Triple Ranking Test".to_string(),
            date: "2025-01-15".to_string(),
            location: "Test".to_string(),
            discipline: "BenchPress".to_string(),
            federation_rules: None,
            competition_type: None,
            organizer: None,
            notes: None,
        }).await.expect("Failed to create contest");

        // Create 3 competitors in different categories to test rankings
        struct TestCompetitor {
            name: &'static str,
            birth_date: &'static str,
            bodyweight: f64,
            age_cat: &'static str,
            weight_cat: &'static str,
            bench_weight: f64,
            reshel: f64,
        }

        let test_data = vec![
            TestCompetitor {
                name: "Senior Heavy",
                birth_date: "1990-01-01",
                bodyweight: 145.0,
                age_cat: "SENIOR",
                weight_cat: "M_140_PLUS",
                bench_weight: 200.0,
                reshel: 0.5500,
            },
            TestCompetitor {
                name: "Senior Light",
                birth_date: "1991-01-01",
                bodyweight: 89.0,
                age_cat: "SENIOR",
                weight_cat: "M_90",
                bench_weight: 150.0,
                reshel: 0.6500,
            },
            TestCompetitor {
                name: "Veteran Heavy",
                birth_date: "1980-01-01",
                bodyweight: 142.0,
                age_cat: "VETERAN40",
                weight_cat: "M_140_PLUS",
                bench_weight: 180.0,
                reshel: 0.5550,
            },
        ];

        // Create competitors and registrations
        for (i, data) in test_data.iter().enumerate() {
            let comp = db.create_competitor(CreateCompetitorRequest {
                first_name: data.name.to_string(),
                last_name: format!("Lifter{}", i),
                birth_date: data.birth_date.to_string(),
                gender: "Male".to_string(),
                club: None,
                city: None,
                notes: None,
            }).await.expect("Failed to create competitor");

            let reg = db.register_competitor(CreateRegistrationRequest {
                contest_id: contest.id.clone(),
                competitor_id: comp.id.clone(),
                age_category_id: data.age_cat.to_string(),
                weight_class_id: data.weight_cat.to_string(),
                equipment_m: false,
                equipment_sm: false,
                equipment_t: false,
                bodyweight: data.bodyweight,
                lot_number: Some((i + 1).to_string()),
                personal_record_at_entry: None,
                reshel_coefficient: Some(data.reshel),
                mccullough_coefficient: Some(1.0),
                rack_height_squat: None,
                rack_height_bench: None,
            }).await.expect("Failed to register");

            // Record successful attempt
            attempts::record_attempt(db.pool(), CreateAttemptRequest {
                registration_id: reg.id.clone(),
                lift_type: "BenchPress".to_string(),
                attempt_number: 1,
                weight: data.bench_weight,
                status: Some("Good".to_string()),
                judge1_decision: Some(true),
                judge2_decision: Some(true),
                judge3_decision: Some(true),
                notes: None,
            }).await.expect("Failed to record attempt");

            // Calculate results
            results::calculate_results(db.pool(), &reg.id)
                .await.expect("Failed to calculate results");
        }

        // Update all rankings
        results::update_all_rankings(db.pool(), &contest.id)
            .await.expect("Failed to update rankings");

        // Get open ranking
        let open_ranking = results::get_open_ranking(db.pool(), &contest.id)
            .await.expect("Failed to get open ranking");
        
        // Verify open ranking (by coefficient points)
        // Senior Heavy: 200 * 0.5500 = 110.0
        // Senior Light: 150 * 0.6500 = 97.5
        // Veteran Heavy: 180 * 0.5550 = 99.9
        assert_eq!(open_ranking.len(), 3);
        assert_eq!(open_ranking[0].place_open, Some(1)); // Senior Heavy (110.0)
        assert_eq!(open_ranking[1].place_open, Some(2)); // Veteran Heavy (99.9)
        assert_eq!(open_ranking[2].place_open, Some(3)); // Senior Light (97.5)

        // Verify age category rankings
        // In SENIOR category: Senior Heavy (1st), Senior Light (2nd)
        // In VETERAN40 category: Veteran Heavy (1st and only)
        for result in &open_ranking {
            if result.total_weight == 200.0 { // Senior Heavy
                assert_eq!(result.place_in_age_class, Some(1)); // 1st in SENIOR
                assert_eq!(result.place_in_weight_class, Some(1)); // 1st in M_140_PLUS
            } else if result.total_weight == 150.0 { // Senior Light
                assert_eq!(result.place_in_age_class, Some(2)); // 2nd in SENIOR
                assert_eq!(result.place_in_weight_class, Some(1)); // 1st (only) in M_90
            } else if result.total_weight == 180.0 { // Veteran Heavy
                assert_eq!(result.place_in_age_class, Some(1)); // 1st (only) in VETERAN40
                assert_eq!(result.place_in_weight_class, Some(2)); // 2nd in M_140_PLUS
            }
        }
    }

    #[tokio::test]
    async fn test_equipment_flags() {
        let db = create_test_db().await;

        // Create contest and competitor
        let contest = db.create_contest(CreateContestRequest {
            name: "Equipment Test".to_string(),
            date: "2025-01-15".to_string(),
            location: "Test".to_string(),
            discipline: "BenchPress".to_string(),
            federation_rules: None,
            competition_type: None,
            organizer: None,
            notes: None,
        }).await.expect("Failed to create contest");

        let competitor = db.create_competitor(CreateCompetitorRequest {
            first_name: "Equipment".to_string(),
            last_name: "Tester".to_string(),
            birth_date: "1990-01-01".to_string(),
            gender: "Male".to_string(),
            club: None,
            city: None,
            notes: None,
        }).await.expect("Failed to create competitor");

        // Test multiple equipment flags (like in CSV: both T and SM)
        let registration = db.register_competitor(CreateRegistrationRequest {
            contest_id: contest.id,
            competitor_id: competitor.id,
            age_category_id: "SENIOR".to_string(),
            weight_class_id: "M_100".to_string(),
            equipment_m: false,
            equipment_sm: true, // Single-ply
            equipment_t: true,  // AND equipped shirt (both flags true)
            bodyweight: 95.0,
            lot_number: Some("1".to_string()),
            personal_record_at_entry: None,
            reshel_coefficient: Some(0.6300),
            mccullough_coefficient: Some(1.0),
            rack_height_squat: None,
            rack_height_bench: None,
        }).await.expect("Failed to register");

        // Verify both equipment flags are set
        assert!(registration.equipment_sm);
        assert!(registration.equipment_t);
        assert!(!registration.equipment_m);
    }
}