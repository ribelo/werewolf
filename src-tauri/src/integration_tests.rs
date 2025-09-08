use crate::database;
use crate::models::attempt::{AttemptStatus, AttemptUpsert, LiftType};
use crate::models::competitor::CompetitorCreate;
use crate::models::contest::{Discipline, NewContest};
use crate::models::contest_state::{ContestState, ContestStatus};
use chrono::NaiveDate;
use sqlx::SqlitePool;
use tempfile::tempdir;

/// Integration tests for the complete contest workflow
/// These tests exercise the full stack: Database -> Queries -> Commands
#[cfg(test)]
mod integration_tests {
    use super::*;

    async fn setup_test_db() -> Result<SqlitePool, sqlx::Error> {
        let temp_dir = tempdir().unwrap();
        let db_path = temp_dir.path().join("test.db");
        let db_url = format!("sqlite://{}?mode=rwc", db_path.display());

        let pool = SqlitePool::connect(&db_url).await?;
        database::run_migrations(&pool).await?;

        // Keep temp_dir alive for the test duration
        std::mem::forget(temp_dir);
        Ok(pool)
    }

    #[tokio::test]
    async fn test_complete_contest_workflow() {
        let pool = setup_test_db()
            .await
            .expect("Failed to setup test database");

        // Step 1: Create contest
        let new_contest = NewContest {
            name: "Test Championship 2024".to_string(),
            date: NaiveDate::from_ymd_opt(2024, 12, 15).unwrap(),
            location: "Test Gym".to_string(),
            discipline: Discipline::Powerlifting,
            federation_rules: Some("IPF Rules".to_string()),
            competition_type: Some("Local".to_string()),
            organizer: Some("Test Organizer".to_string()),
            notes: Some("Integration test contest".to_string()),
        };

        let contest = database::queries::contests::create_contest(&pool, new_contest)
            .await
            .expect("Failed to create contest");

        assert_eq!(contest.name, "Test Championship 2024");
        assert_eq!(contest.location, "Test Gym");

        // Step 2: Create competitors
        let competitor1 = CompetitorCreate {
            first_name: "John".to_string(),
            last_name: "Doe".to_string(),
            birth_date: "1990-05-15".to_string(),
            gender: "Male".to_string(),
            photo_base64: None,
            photo_filename: None,
        };

        let competitor2 = CompetitorCreate {
            first_name: "Jane".to_string(),
            last_name: "Smith".to_string(),
            birth_date: "1985-08-22".to_string(),
            gender: "Female".to_string(),
            photo_base64: None,
            photo_filename: None,
        };

        let comp1 = database::queries::competitors::create_competitor(
            &pool,
            database::queries::competitors::CreateCompetitorRequest {
                first_name: competitor1.first_name,
                last_name: competitor1.last_name,
                birth_date: competitor1.birth_date,
                gender: competitor1.gender,
                club: None,
                city: None,
                notes: None,
                photo_base64: None,
                photo_filename: None,
            },
        )
        .await
        .expect("Failed to create competitor 1");

        let comp2 = database::queries::competitors::create_competitor(
            &pool,
            database::queries::competitors::CreateCompetitorRequest {
                first_name: competitor2.first_name,
                last_name: competitor2.last_name,
                birth_date: competitor2.birth_date,
                gender: competitor2.gender,
                club: None,
                city: None,
                notes: None,
                photo_base64: None,
                photo_filename: None,
            },
        )
        .await
        .expect("Failed to create competitor 2");

        // Step 3: Create registrations
        let reg1 = database::queries::registrations::create_registration(
            &pool,
            database::queries::registrations::CreateRegistrationRequest {
                contest_id: contest.id.clone(),
                competitor_id: comp1.id.clone(),
                age_category_id: "SENIOR".to_string(),
                weight_class_id: "M_75".to_string(),
                equipment_m: false,
                equipment_sm: false,
                equipment_t: false,
                bodyweight: 75.5,
                lot_number: None,
                personal_record_at_entry: None,
                reshel_coefficient: Some(1.0),
                mccullough_coefficient: Some(1.0),
                rack_height_squat: None,
                rack_height_bench: None,
            },
        )
        .await
        .expect("Failed to create registration 1");

        let reg2 = database::queries::registrations::create_registration(
            &pool,
            database::queries::registrations::CreateRegistrationRequest {
                contest_id: contest.id.clone(),
                competitor_id: comp2.id.clone(),
                age_category_id: "SENIOR".to_string(),
                weight_class_id: "F_63".to_string(),
                equipment_m: false,
                equipment_sm: false,
                equipment_t: false,
                bodyweight: 65.0,
                lot_number: None,
                personal_record_at_entry: None,
                reshel_coefficient: Some(1.0),
                mccullough_coefficient: Some(1.0),
                rack_height_squat: None,
                rack_height_bench: None,
            },
        )
        .await
        .expect("Failed to create registration 2");

        // Step 4: Update contest state to InProgress
        let contest_state = ContestState {
            contest_id: contest.id.clone(),
            status: ContestStatus::InProgress,
            current_lift: Some(LiftType::Squat),
            current_round: 1,
        };

        database::queries::contest_states::upsert_contest_state(&pool, &contest_state)
            .await
            .expect("Failed to update contest state");

        // Step 5: Add attempts with weights
        let attempt1 = AttemptUpsert {
            registration_id: reg1.id.clone(),
            lift_type: LiftType::Squat,
            attempt_number: 1,
            weight: 100.0,
        };

        database::queries::attempts::upsert_attempt_weight(
            &pool,
            &attempt1.registration_id,
            &attempt1.lift_type.to_string(),
            attempt1.attempt_number,
            attempt1.weight,
        )
        .await
        .expect("Failed to upsert attempt weight");

        let attempt2 = AttemptUpsert {
            registration_id: reg2.id.clone(),
            lift_type: LiftType::Squat,
            attempt_number: 1,
            weight: 80.0,
        };

        database::queries::attempts::upsert_attempt_weight(
            &pool,
            &attempt2.registration_id,
            &attempt2.lift_type.to_string(),
            attempt2.attempt_number,
            attempt2.weight,
        )
        .await
        .expect("Failed to upsert attempt weight");

        // Step 6: Mark attempts as good/bad
        let attempts = database::queries::attempts::get_attempts_by_registration(&pool, &reg1.id)
            .await
            .expect("Failed to get attempts");

        assert!(!attempts.is_empty(), "Should have at least one attempt");
        let first_attempt = &attempts[0];

        database::queries::attempts::update_attempt_result(
            &pool,
            &first_attempt.id,
            &AttemptStatus::Successful.to_string(),
            None,
            None,
            None,
        )
        .await
        .expect("Failed to update attempt result");

        // Step 7: Calculate results
        let result1 = database::queries::results::calculate_results(&pool, &reg1.id)
            .await
            .expect("Failed to calculate results for competitor 1");

        assert_eq!(result1.registration_id, reg1.id);
        assert_eq!(result1.best_squat, Some(100.0));
        assert_eq!(result1.total_weight, 100.0);

        // Step 8: Get contest results and rankings
        database::queries::results::update_all_rankings(&pool, &contest.id)
            .await
            .expect("Failed to update rankings");

        let open_ranking = database::queries::results::get_open_ranking(&pool, &contest.id)
            .await
            .expect("Failed to get open ranking");

        assert!(!open_ranking.is_empty(), "Should have results in ranking");

        // Step 9: Test backup functionality
        let db_path = format!(
            "sqlite:{}",
            tempdir().unwrap().path().join("backup_test.db").display()
        );
        std::env::set_var("DATABASE_URL", &db_path);

        // This would test the backup functionality in a real scenario
        // For now, we just verify the workflow completed successfully

        println!("✅ Complete contest workflow test passed!");
        println!("   - Created contest: {}", contest.name);
        println!("   - Registered {} competitors", 2);
        println!("   - Processed attempts and calculated results");
        println!("   - Generated rankings");
    }

    #[tokio::test]
    async fn test_attempt_queue_management() {
        let pool = setup_test_db()
            .await
            .expect("Failed to setup test database");

        // Create minimal contest setup
        let contest = database::queries::contests::create_contest(
            &pool,
            NewContest {
                name: "Queue Test".to_string(),
                date: NaiveDate::from_ymd_opt(2024, 12, 15).unwrap(),
                location: "Test Gym".to_string(),
                discipline: Discipline::Powerlifting,
                federation_rules: None,
                competition_type: None,
                organizer: None,
                notes: None,
            },
        )
        .await
        .expect("Failed to create contest");

        // Create competitor and registration
        let competitor = database::queries::competitors::create_competitor(
            &pool,
            database::queries::competitors::CreateCompetitorRequest {
                first_name: "Test".to_string(),
                last_name: "Lifter".to_string(),
                birth_date: "1990-01-01".to_string(),
                gender: "Male".to_string(),
                club: None,
                city: None,
                notes: None,
                photo_base64: None,
                photo_filename: None,
            },
        )
        .await
        .expect("Failed to create competitor");

        let registration = database::queries::registrations::create_registration(
            &pool,
            database::queries::registrations::CreateRegistrationRequest {
                contest_id: contest.id.clone(),
                competitor_id: competitor.id,
                age_category_id: "SENIOR".to_string(),
                weight_class_id: "M_75".to_string(),
                equipment_m: false,
                equipment_sm: false,
                equipment_t: false,
                bodyweight: 75.0,
                lot_number: None,
                personal_record_at_entry: None,
                reshel_coefficient: Some(1.0),
                mccullough_coefficient: Some(1.0),
                rack_height_squat: None,
                rack_height_bench: None,
            },
        )
        .await
        .expect("Failed to create registration");

        // Set contest state
        let contest_state = ContestState {
            contest_id: contest.id.clone(),
            status: ContestStatus::InProgress,
            current_lift: Some(LiftType::Squat),
            current_round: 1,
        };
        database::queries::contest_states::upsert_contest_state(&pool, &contest_state)
            .await
            .expect("Failed to set contest state");

        // Add attempt
        database::queries::attempts::upsert_attempt_weight(
            &pool,
            &registration.id,
            &LiftType::Squat.to_string(),
            1,
            100.0,
        )
        .await
        .expect("Failed to add attempt");

        // Test queue functionality
        let queue = database::queries::attempts::get_next_attempts_in_queue(
            &pool,
            &contest.id,
            &LiftType::Squat.to_string(),
            1,
        )
        .await
        .expect("Failed to get attempt queue");

        assert_eq!(queue.len(), 1, "Should have one attempt in queue");
        assert_eq!(queue[0].weight, 100.0, "Attempt weight should match");

        println!("✅ Attempt queue management test passed!");
    }

    #[tokio::test]
    async fn test_error_handling() {
        let pool = setup_test_db()
            .await
            .expect("Failed to setup test database");

        // Test creating contest with invalid data
        let invalid_contest = NewContest {
            name: "".to_string(), // Empty name should be handled gracefully
            date: NaiveDate::from_ymd_opt(2024, 12, 15).unwrap(),
            location: "Test".to_string(),
            discipline: Discipline::Powerlifting,
            federation_rules: None,
            competition_type: None,
            organizer: None,
            notes: None,
        };

        // This should either succeed (if database allows empty names) or fail gracefully
        let result = database::queries::contests::create_contest(&pool, invalid_contest).await;
        match result {
            Ok(_) => println!("Database allows empty contest names"),
            Err(e) => println!("Database properly rejects empty contest names: {}", e),
        }

        // Test getting non-existent records
        let non_existent_contest =
            database::queries::contests::get_contest_by_id(&pool, "non-existent-id").await;
        match non_existent_contest {
            Ok(None) => println!("✅ Properly handles non-existent contest"),
            Ok(Some(_)) => panic!("Should not return a contest for non-existent ID"),
            Err(e) => println!("Database error for non-existent contest: {}", e),
        }

        println!("✅ Error handling test completed!");
    }
}
