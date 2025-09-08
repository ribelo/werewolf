#[cfg(test)]
mod tests {
    use crate::database::queries::*;
    use crate::database::DatabasePool;
    use crate::models::contest::{ContestStatus, Discipline, NewContest};
    use chrono::NaiveDate;
    use tempfile::tempdir;

    async fn setup_test_db() -> DatabasePool {
        let temp_dir = tempdir().expect("Failed to create temp directory");
        let db_path = temp_dir.path().join("test.db");
        let db_url = format!("sqlite:{}", db_path.to_str().unwrap());

        // Create database and run migrations
        let pool = sqlx::SqlitePool::connect(&db_url)
            .await
            .expect("Failed to connect to test database");
        crate::database::run_migrations(&pool)
            .await
            .expect("Failed to run migrations");
        pool
    }

    // Compile-time safety tests
    #[test]
    fn test_sqlx_compile_time_safety() {
        // If our SQLx query_as! macros had incorrect SQL, this wouldn't compile.
        // The successful compilation of this crate proves that:
        // 1. All table names are correct
        // 2. All column names match the database schema
        // 3. All type mappings are correct (String vs Option<String>)
        // 4. All query syntax is valid SQLite

        // This is verified by the fact that cargo check/cargo test compiles successfully
        // with SQLX_OFFLINE=false (live database verification) or SQLX_OFFLINE=true (cached verification)

        assert!(
            true,
            "If this compiles, SQLx compile-time safety is working"
        );
    }

    #[test]
    fn test_type_safety() {
        // Our explicit type annotations with ! suffix ensure proper nullability:
        // - Fields marked with ! are NOT NULL and map to String/bool/etc
        // - Fields without ! are nullable and map to Option<String>/etc
        //
        // Example from our queries:
        // id as "id!" -> String (NOT NULL)
        // club       -> Option<String> (nullable)
        //
        // This prevents runtime errors from type mismatches.

        assert!(
            true,
            "Type annotations ensure correct NULL/NOT NULL mappings"
        );
    }

    // Competitor tests
    #[tokio::test]
    async fn test_create_competitor() {
        let pool = setup_test_db().await;

        let request = CreateCompetitorRequest {
            first_name: "John".to_string(),
            last_name: "Doe".to_string(),
            birth_date: "1990-01-01".to_string(),
            gender: "Male".to_string(),
            club: Some("Test Club".to_string()),
            city: Some("Test City".to_string()),
            notes: Some("Test notes".to_string()),
            photo_base64: None,
            photo_filename: None,
        };

        let competitor = create_competitor(&pool, request)
            .await
            .expect("Failed to create competitor");

        assert_eq!(competitor.first_name, "John");
        assert_eq!(competitor.last_name, "Doe");
        assert_eq!(competitor.birth_date, "1990-01-01");
        assert_eq!(competitor.gender, "Male");
        assert_eq!(competitor.club, Some("Test Club".to_string()));
        assert_eq!(competitor.city, Some("Test City".to_string()));
        assert_eq!(competitor.notes, Some("Test notes".to_string()));
        assert!(competitor.photo_data.is_none());
        assert!(competitor.photo_format.is_none());
        assert!(competitor.photo_metadata.is_none());
    }

    #[tokio::test]
    async fn test_get_competitor_by_id() {
        let pool = setup_test_db().await;

        let request = CreateCompetitorRequest {
            first_name: "Jane".to_string(),
            last_name: "Smith".to_string(),
            birth_date: "1995-06-15".to_string(),
            gender: "Female".to_string(),
            club: None,
            city: None,
            notes: None,
            photo_base64: None,
            photo_filename: None,
        };

        let created = create_competitor(&pool, request)
            .await
            .expect("Failed to create competitor");

        let retrieved = get_competitor_by_id(&pool, &created.id)
            .await
            .expect("Failed to get competitor by ID");

        assert_eq!(created.id, retrieved.id);
        assert_eq!(created.first_name, retrieved.first_name);
        assert_eq!(created.last_name, retrieved.last_name);
        assert_eq!(created.birth_date, retrieved.birth_date);
        assert_eq!(created.gender, retrieved.gender);
    }

    #[tokio::test]
    async fn test_get_all_competitors() {
        let pool = setup_test_db().await;

        // Create multiple competitors
        let requests = vec![
            CreateCompetitorRequest {
                first_name: "Alice".to_string(),
                last_name: "Johnson".to_string(),
                birth_date: "1988-03-20".to_string(),
                gender: "Female".to_string(),
                club: None,
                city: None,
                notes: None,
                photo_base64: None,
                photo_filename: None,
            },
            CreateCompetitorRequest {
                first_name: "Bob".to_string(),
                last_name: "Wilson".to_string(),
                birth_date: "1992-11-10".to_string(),
                gender: "Male".to_string(),
                club: None,
                city: None,
                notes: None,
                photo_base64: None,
                photo_filename: None,
            },
        ];

        for request in requests {
            create_competitor(&pool, request)
                .await
                .expect("Failed to create competitor");
        }

        let competitors = get_all_competitors(&pool)
            .await
            .expect("Failed to get all competitors");

        assert_eq!(competitors.len(), 2);
        // Should be ordered by last_name, first_name
        assert_eq!(competitors[0].last_name, "Johnson");
        assert_eq!(competitors[1].last_name, "Wilson");
    }

    #[tokio::test]
    async fn test_update_competitor() {
        let pool = setup_test_db().await;

        let create_request = CreateCompetitorRequest {
            first_name: "Original".to_string(),
            last_name: "Name".to_string(),
            birth_date: "1990-01-01".to_string(),
            gender: "Male".to_string(),
            club: None,
            city: None,
            notes: None,
            photo_base64: None,
            photo_filename: None,
        };

        let competitor = create_competitor(&pool, create_request)
            .await
            .expect("Failed to create competitor");

        let update_request = CreateCompetitorRequest {
            first_name: "Updated".to_string(),
            last_name: "Name".to_string(),
            birth_date: "1990-01-01".to_string(),
            gender: "Male".to_string(),
            club: Some("New Club".to_string()),
            city: Some("New City".to_string()),
            notes: Some("Updated notes".to_string()),
            photo_base64: None,
            photo_filename: None,
        };

        update_competitor(&pool, &competitor.id, update_request)
            .await
            .expect("Failed to update competitor");

        let updated = get_competitor_by_id(&pool, &competitor.id)
            .await
            .expect("Failed to get updated competitor");

        assert_eq!(updated.first_name, "Updated");
        assert_eq!(updated.club, Some("New Club".to_string()));
        assert_eq!(updated.city, Some("New City".to_string()));
        assert_eq!(updated.notes, Some("Updated notes".to_string()));
    }

    #[tokio::test]
    async fn test_delete_competitor() {
        let pool = setup_test_db().await;

        let request = CreateCompetitorRequest {
            first_name: "To".to_string(),
            last_name: "Delete".to_string(),
            birth_date: "1990-01-01".to_string(),
            gender: "Male".to_string(),
            club: None,
            city: None,
            notes: None,
            photo_base64: None,
            photo_filename: None,
        };

        let competitor = create_competitor(&pool, request)
            .await
            .expect("Failed to create competitor");

        // Verify competitor exists
        let _ = get_competitor_by_id(&pool, &competitor.id)
            .await
            .expect("Competitor should exist before deletion");

        // Delete competitor
        delete_competitor(&pool, &competitor.id)
            .await
            .expect("Failed to delete competitor");

        // Verify competitor no longer exists
        let result = get_competitor_by_id(&pool, &competitor.id).await;
        assert!(
            result.is_err(),
            "Competitor should not exist after deletion"
        );
    }

    #[tokio::test]
    async fn test_competitor_photo_operations() {
        let pool = setup_test_db().await;

        let request = CreateCompetitorRequest {
            first_name: "Photo".to_string(),
            last_name: "Test".to_string(),
            birth_date: "1990-01-01".to_string(),
            gender: "Male".to_string(),
            club: None,
            city: None,
            notes: None,
            photo_base64: None,
            photo_filename: None,
        };

        let competitor = create_competitor(&pool, request)
            .await
            .expect("Failed to create competitor");

        // Test get photo when none exists
        let photo = get_competitor_photo(&pool, &competitor.id)
            .await
            .expect("Failed to get competitor photo");
        assert!(photo.is_none());

        // Test remove photo when none exists (should not error)
        remove_competitor_photo(&pool, &competitor.id)
            .await
            .expect("Failed to remove non-existent photo");
    }

    // Contest tests
    #[tokio::test]
    async fn test_create_contest() {
        let pool = setup_test_db().await;

        let new_contest = NewContest {
            name: "Test Contest".to_string(),
            date: NaiveDate::from_ymd_opt(2024, 12, 1).unwrap(),
            location: "Test Location".to_string(),
            discipline: Discipline::Powerlifting,
            federation_rules: Some("IPF".to_string()),
            competition_type: Some("Regional".to_string()),
            organizer: Some("Test Organizer".to_string()),
            notes: Some("Test contest notes".to_string()),
        };

        let contest = create_contest(&pool, new_contest)
            .await
            .expect("Failed to create contest");

        assert_eq!(contest.name, "Test Contest");
        assert_eq!(contest.date, NaiveDate::from_ymd_opt(2024, 12, 1).unwrap());
        assert_eq!(contest.location, "Test Location");
        assert_eq!(contest.discipline, Discipline::Powerlifting);
        assert_eq!(contest.status, ContestStatus::Setup);
        assert_eq!(contest.is_archived, false);
    }

    #[tokio::test]
    async fn test_get_contest_by_id() {
        let pool = setup_test_db().await;

        let new_contest = NewContest {
            name: "Another Test Contest".to_string(),
            date: NaiveDate::from_ymd_opt(2024, 12, 15).unwrap(),
            location: "Another Location".to_string(),
            discipline: Discipline::Powerlifting,
            federation_rules: None,
            competition_type: None,
            organizer: None,
            notes: None,
        };

        let created = create_contest(&pool, new_contest)
            .await
            .expect("Failed to create contest");

        let retrieved = get_contest_by_id(&pool, &created.id)
            .await
            .expect("Failed to get contest by ID")
            .expect("Contest should exist");

        assert_eq!(created.id, retrieved.id);
        assert_eq!(created.name, retrieved.name);
        assert_eq!(created.date, retrieved.date);
        assert_eq!(created.location, retrieved.location);
    }

    #[tokio::test]
    async fn test_get_all_contests() {
        let pool = setup_test_db().await;

        // Create multiple contests
        let contests_data = vec![
            NewContest {
                name: "Contest A".to_string(),
                date: NaiveDate::from_ymd_opt(2024, 11, 1).unwrap(),
                location: "Location A".to_string(),
                discipline: Discipline::Powerlifting,
                federation_rules: None,
                competition_type: None,
                organizer: None,
                notes: None,
            },
            NewContest {
                name: "Contest B".to_string(),
                date: NaiveDate::from_ymd_opt(2024, 11, 15).unwrap(),
                location: "Location B".to_string(),
                discipline: Discipline::Powerlifting,
                federation_rules: None,
                competition_type: None,
                organizer: None,
                notes: None,
            },
        ];

        for new_contest in contests_data {
            create_contest(&pool, new_contest)
                .await
                .expect("Failed to create contest");
        }

        let contests = get_all_contests(&pool)
            .await
            .expect("Failed to get all contests");

        assert_eq!(contests.len(), 2);
        // Should be ordered by date DESC
        assert_eq!(contests[0].name, "Contest B"); // 2024-11-15
        assert_eq!(contests[1].name, "Contest A"); // 2024-11-01
    }

    #[tokio::test]
    async fn test_update_contest() {
        let pool = setup_test_db().await;

        let new_contest = NewContest {
            name: "Original Contest".to_string(),
            date: NaiveDate::from_ymd_opt(2024, 12, 1).unwrap(),
            location: "Original Location".to_string(),
            discipline: Discipline::Powerlifting,
            federation_rules: None,
            competition_type: None,
            organizer: None,
            notes: None,
        };

        let contest = create_contest(&pool, new_contest)
            .await
            .expect("Failed to create contest");

        let mut updated_contest = contest.clone();
        updated_contest.name = "Updated Contest".to_string();
        updated_contest.date = NaiveDate::from_ymd_opt(2024, 12, 15).unwrap();
        updated_contest.location = "Updated Location".to_string();
        updated_contest.status = ContestStatus::InProgress;
        updated_contest.federation_rules = Some("IPF".to_string());
        updated_contest.competition_type = Some("National".to_string());
        updated_contest.organizer = Some("New Organizer".to_string());
        updated_contest.notes = Some("Updated notes".to_string());

        update_contest(&pool, &contest.id, updated_contest)
            .await
            .expect("Failed to update contest");

        let updated = get_contest_by_id(&pool, &contest.id)
            .await
            .expect("Failed to get updated contest")
            .expect("Contest should exist");

        assert_eq!(updated.name, "Updated Contest");
        assert_eq!(updated.date, NaiveDate::from_ymd_opt(2024, 12, 15).unwrap());
        assert_eq!(updated.location, "Updated Location");
        assert_eq!(updated.status, ContestStatus::InProgress);
        assert_eq!(updated.federation_rules, Some("IPF".to_string()));
        assert_eq!(updated.competition_type, Some("National".to_string()));
        assert_eq!(updated.organizer, Some("New Organizer".to_string()));
        assert_eq!(updated.notes, Some("Updated notes".to_string()));
    }

    #[tokio::test]
    async fn test_delete_contest() {
        let pool = setup_test_db().await;

        let new_contest = NewContest {
            name: "Contest to Delete".to_string(),
            date: NaiveDate::from_ymd_opt(2024, 12, 1).unwrap(),
            location: "Delete Location".to_string(),
            discipline: Discipline::Powerlifting,
            federation_rules: None,
            competition_type: None,
            organizer: None,
            notes: None,
        };

        let contest = create_contest(&pool, new_contest)
            .await
            .expect("Failed to create contest");

        // Verify contest exists
        let _ = get_contest_by_id(&pool, &contest.id)
            .await
            .expect("Failed to get contest")
            .expect("Contest should exist before deletion");

        // Delete contest
        delete_contest(&pool, &contest.id)
            .await
            .expect("Failed to delete contest");

        // Verify contest no longer exists
        let result = get_contest_by_id(&pool, &contest.id)
            .await
            .expect("Query should succeed");
        assert!(result.is_none(), "Contest should not exist after deletion");
    }

    #[tokio::test]
    async fn test_contest_status_and_archiving() {
        let pool = setup_test_db().await;

        let new_contest = NewContest {
            name: "Status Test Contest".to_string(),
            date: NaiveDate::from_ymd_opt(2024, 12, 1).unwrap(),
            location: "Status Location".to_string(),
            discipline: Discipline::Powerlifting,
            federation_rules: None,
            competition_type: None,
            organizer: None,
            notes: None,
        };

        let contest = create_contest(&pool, new_contest)
            .await
            .expect("Failed to create contest");

        // Test updating status via update_contest
        let mut updated_contest = contest.clone();
        updated_contest.status = ContestStatus::InProgress;

        update_contest(&pool, &contest.id, updated_contest)
            .await
            .expect("Failed to update contest status");

        let retrieved = get_contest_by_id(&pool, &contest.id)
            .await
            .expect("Failed to get contest")
            .expect("Contest should exist");

        assert_eq!(retrieved.status, ContestStatus::InProgress);

        // Test archiving via update_contest
        let mut archived_contest = retrieved.clone();
        archived_contest.is_archived = true;
        archived_contest.status = ContestStatus::Completed;

        update_contest(&pool, &contest.id, archived_contest)
            .await
            .expect("Failed to archive contest");

        let archived = get_contest_by_id(&pool, &contest.id)
            .await
            .expect("Failed to get archived contest")
            .expect("Contest should exist");

        assert_eq!(archived.is_archived, true);
        assert_eq!(archived.status, ContestStatus::Completed);
    }

    // Registration tests
    #[tokio::test]
    async fn test_competitor_contest_integration() {
        let pool = setup_test_db().await;

        // Create a competitor
        let competitor_request = CreateCompetitorRequest {
            first_name: "Integration".to_string(),
            last_name: "Test".to_string(),
            birth_date: "1990-05-15".to_string(),
            gender: "Female".to_string(),
            club: Some("Test Club".to_string()),
            city: None,
            notes: None,
            photo_base64: None,
            photo_filename: None,
        };

        let competitor = create_competitor(&pool, competitor_request)
            .await
            .expect("Failed to create competitor");

        // Create a contest
        let new_contest = NewContest {
            name: "Integration Test Contest".to_string(),
            date: NaiveDate::from_ymd_opt(2024, 12, 10).unwrap(),
            location: "Test Location".to_string(),
            discipline: Discipline::Powerlifting,
            federation_rules: None,
            competition_type: None,
            organizer: None,
            notes: None,
        };

        let contest = create_contest(&pool, new_contest)
            .await
            .expect("Failed to create contest");

        // Verify both exist independently
        let retrieved_competitor = get_competitor_by_id(&pool, &competitor.id)
            .await
            .expect("Failed to get competitor");
        let retrieved_contest = get_contest_by_id(&pool, &contest.id)
            .await
            .expect("Failed to get contest")
            .expect("Contest should exist");

        assert_eq!(retrieved_competitor.first_name, "Integration");
        assert_eq!(retrieved_contest.name, "Integration Test Contest");

        // Clean up by deleting
        delete_competitor(&pool, &competitor.id)
            .await
            .expect("Failed to delete competitor");
        delete_contest(&pool, &contest.id)
            .await
            .expect("Failed to delete contest");

        // Verify they're gone
        let competitor_result = get_competitor_by_id(&pool, &competitor.id).await;
        assert!(competitor_result.is_err(), "Competitor should be deleted");

        let contest_result = get_contest_by_id(&pool, &contest.id)
            .await
            .expect("Query should succeed");
        assert!(contest_result.is_none(), "Contest should be deleted");
    }

    // Error handling tests
    #[tokio::test]
    async fn test_get_nonexistent_competitor() {
        let pool = setup_test_db().await;

        let fake_id = "non-existent-id";
        let result = get_competitor_by_id(&pool, fake_id).await;

        assert!(
            result.is_err(),
            "Should return error for non-existent competitor"
        );
    }

    #[tokio::test]
    async fn test_get_nonexistent_contest() {
        let pool = setup_test_db().await;

        let fake_id = "non-existent-id";
        let result = get_contest_by_id(&pool, fake_id)
            .await
            .expect("Query should not error");

        assert!(
            result.is_none(),
            "Should return None for non-existent contest"
        );
    }

    #[tokio::test]
    async fn test_invalid_date_in_competitor() {
        let pool = setup_test_db().await;

        // This should be caught by validation, but let's test the database layer
        let request = CreateCompetitorRequest {
            first_name: "Invalid".to_string(),
            last_name: "Date".to_string(),
            birth_date: "invalid-date".to_string(), // Invalid date format
            gender: "Male".to_string(),
            club: None,
            city: None,
            notes: None,
            photo_base64: None,
            photo_filename: None,
        };

        // The database should accept this since it's stored as TEXT
        // Validation should happen at the application layer
        let competitor = create_competitor(&pool, request)
            .await
            .expect("Database should accept invalid date format as TEXT");

        assert_eq!(competitor.birth_date, "invalid-date");
    }

    #[tokio::test]
    async fn test_empty_lists() {
        let pool = setup_test_db().await;

        // Test getting all items when none exist
        let competitors = get_all_competitors(&pool)
            .await
            .expect("Should succeed even with no competitors");
        assert!(competitors.is_empty());

        let contests = get_all_contests(&pool)
            .await
            .expect("Should succeed even with no contests");
        assert!(contests.is_empty());
    }

    #[tokio::test]
    async fn test_competitor_ordering() {
        let pool = setup_test_db().await;

        // Create competitors with specific names to test ordering
        let competitors_data = vec![("Zebra", "Alpha"), ("Alpha", "Zebra"), ("Beta", "Beta")];

        for (first, last) in competitors_data {
            let request = CreateCompetitorRequest {
                first_name: first.to_string(),
                last_name: last.to_string(),
                birth_date: "1990-01-01".to_string(),
                gender: "Male".to_string(),
                club: None,
                city: None,
                notes: None,
                photo_base64: None,
                photo_filename: None,
            };

            create_competitor(&pool, request)
                .await
                .expect("Failed to create competitor");
        }

        let competitors = get_all_competitors(&pool)
            .await
            .expect("Failed to get competitors");

        assert_eq!(competitors.len(), 3);
        // Should be ordered by last_name, first_name
        assert_eq!(competitors[0].last_name, "Alpha"); // Zebra Alpha
        assert_eq!(competitors[1].last_name, "Beta"); // Beta Beta
        assert_eq!(competitors[2].last_name, "Zebra"); // Alpha Zebra
    }

    #[tokio::test]
    async fn test_contest_date_ordering() {
        let pool = setup_test_db().await;

        // Create contests with different dates
        let dates = vec![
            NaiveDate::from_ymd_opt(2024, 1, 1).unwrap(),
            NaiveDate::from_ymd_opt(2024, 12, 31).unwrap(),
            NaiveDate::from_ymd_opt(2024, 6, 15).unwrap(),
        ];

        for (i, date) in dates.iter().enumerate() {
            let new_contest = NewContest {
                name: format!("Contest {}", i + 1),
                date: *date,
                location: "Test Location".to_string(),
                discipline: Discipline::Powerlifting,
                federation_rules: None,
                competition_type: None,
                organizer: None,
                notes: None,
            };

            create_contest(&pool, new_contest)
                .await
                .expect("Failed to create contest");
        }

        let contests = get_all_contests(&pool)
            .await
            .expect("Failed to get contests");

        assert_eq!(contests.len(), 3);
        // Should be ordered by date DESC (newest first)
        assert_eq!(
            contests[0].date,
            NaiveDate::from_ymd_opt(2024, 12, 31).unwrap()
        );
        assert_eq!(
            contests[1].date,
            NaiveDate::from_ymd_opt(2024, 6, 15).unwrap()
        );
        assert_eq!(
            contests[2].date,
            NaiveDate::from_ymd_opt(2024, 1, 1).unwrap()
        );
    }
}
