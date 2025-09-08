use crate::error::AppError;
use crate::models::plate_set::{CreatePlateSet, PlateCalculation, PlateSet};
use sqlx::{Pool, Sqlite};
use uuid::Uuid;

// Validation constants for bar weights
const WEIGHT_INCREMENT: f64 = 0.25;
const MAX_BAR_WEIGHT: f64 = 100.0;
const MIN_BAR_WEIGHT: f64 = 0.0;

pub async fn create_plate_set(
    pool: &Pool<Sqlite>,
    request: CreatePlateSet,
) -> Result<PlateSet, AppError> {
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    let row = sqlx::query!(
        r#"
        INSERT INTO plate_sets (id, contest_id, plate_weight, quantity, color, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        RETURNING id, contest_id, plate_weight, quantity, color, created_at, updated_at
        "#,
        id,
        request.contest_id,
        request.plate_weight,
        request.quantity,
        request.color,
        now,
        now
    )
    .fetch_one(pool)
    .await
    .map_err(|e| AppError::DatabaseError(format!("Failed to create plate set: {}", e)))?;

    Ok(PlateSet {
        id: row.id.expect("Primary key should not be null"),
        contest_id: row.contest_id,
        plate_weight: row.plate_weight,
        quantity: row.quantity as i32,
        color: row.color.unwrap_or_else(|| "#374151".to_string()), // Fallback for existing NULL colors
        created_at: row.created_at,
        updated_at: row.updated_at,
    })
}

pub async fn update_plate_set_quantity(
    pool: &Pool<Sqlite>,
    id: &str,
    quantity: i32,
) -> Result<(), AppError> {
    let now = chrono::Utc::now().to_rfc3339();

    let result = sqlx::query!(
        r#"
        UPDATE plate_sets
        SET quantity = ?, updated_at = ?
        WHERE id = ?
        "#,
        quantity,
        now,
        id
    )
    .execute(pool)
    .await
    .map_err(|e| AppError::DatabaseError(format!("Failed to update plate set: {}", e)))?;

    if result.rows_affected() == 0 {
        return Err(AppError::ValidationError(format!(
            "Plate set with id {} not found",
            id
        )));
    }

    Ok(())
}

pub async fn get_plate_sets_by_contest(
    pool: &Pool<Sqlite>,
    contest_id: &str,
) -> Result<Vec<PlateSet>, AppError> {
    let rows = sqlx::query!(
        r#"
        SELECT id, contest_id, plate_weight, quantity, color, created_at, updated_at
        FROM plate_sets
        WHERE contest_id = ?
        ORDER BY plate_weight DESC
        "#,
        contest_id
    )
    .fetch_all(pool)
    .await
    .map_err(|e| AppError::DatabaseError(format!("Failed to fetch plate sets: {}", e)))?;

    let plate_sets = rows
        .into_iter()
        .map(|row| PlateSet {
            id: row.id.expect("Primary key should not be null"),
            contest_id: row.contest_id,
            plate_weight: row.plate_weight,
            quantity: row.quantity as i32,
            color: row.color.unwrap_or_else(|| "#374151".to_string()), // Fallback for existing NULL colors
            created_at: row.created_at,
            updated_at: row.updated_at,
        })
        .collect();

    Ok(plate_sets)
}

pub async fn delete_plate_set(pool: &Pool<Sqlite>, id: &str) -> Result<(), AppError> {
    let result = sqlx::query!(
        r#"
        DELETE FROM plate_sets
        WHERE id = ?
        "#,
        id
    )
    .execute(pool)
    .await
    .map_err(|e| AppError::DatabaseError(format!("Failed to delete plate set: {}", e)))?;

    if result.rows_affected() == 0 {
        return Err(AppError::ValidationError(format!(
            "Plate set with id {} not found",
            id
        )));
    }

    Ok(())
}

// New function that accepts gender parameter
pub async fn calculate_plates_and_increment_with_gender(
    pool: &Pool<Sqlite>,
    contest_id: &str,
    target_weight: f64,
    gender: Option<&str>,
) -> Result<PlateCalculation, AppError> {
    // Get plate sets and appropriate bar weight based on gender
    let plate_sets = get_plate_sets_by_contest(pool, contest_id).await?;
    let bar_weight = get_contest_bar_weight_by_gender(pool, contest_id, gender).await?;

    // Calculate minimum increment (smallest plate × 2)
    let increment = plate_sets
        .iter()
        .filter(|p| p.quantity > 0)
        .map(|p| p.plate_weight)
        .min_by(|a, b| a.partial_cmp(b).unwrap())
        .unwrap_or(2.5)
        * 2.0;

    let side_weight = (target_weight - bar_weight) / 2.0;

    if side_weight <= 0.0 {
        return Ok(PlateCalculation {
            plates: vec![],
            exact: true,
            total: bar_weight,
            increment,
            target_weight,
            bar_weight,
        });
    }

    let mut remaining = side_weight;
    let mut used_plates = Vec::new();

    // Greedy algorithm - use largest plates first
    let mut sorted_plates = plate_sets;
    sorted_plates.sort_by(|a, b| b.plate_weight.partial_cmp(&a.plate_weight).unwrap());

    for plate in sorted_plates {
        if plate.quantity > 0 && plate.plate_weight <= remaining + f64::EPSILON {
            let max_count = (remaining / plate.plate_weight).floor() as usize;
            let use_count = max_count.min(plate.quantity as usize);

            if use_count > 0 {
                used_plates.push((plate.plate_weight, use_count));
                remaining -= plate.plate_weight * use_count as f64;
            }
        }
    }

    let actual_side_weight = side_weight - remaining;
    let actual_total = actual_side_weight * 2.0 + bar_weight;
    let is_exact = remaining < f64::EPSILON;

    Ok(PlateCalculation {
        plates: used_plates,
        exact: is_exact,
        total: actual_total,
        increment,
        target_weight,
        bar_weight,
    })
}

// Keep original function for backward compatibility
pub async fn calculate_plates_and_increment(
    pool: &Pool<Sqlite>,
    contest_id: &str,
    target_weight: f64,
) -> Result<PlateCalculation, AppError> {
    // Default to men's bar weight for backward compatibility
    calculate_plates_and_increment_with_gender(pool, contest_id, target_weight, Some("Male")).await
}

// New function that supports gender-specific bar weights
pub async fn get_contest_bar_weight_by_gender(
    pool: &Pool<Sqlite>,
    contest_id: &str,
    gender: Option<&str>,
) -> Result<f64, AppError> {
    let row = sqlx::query!(
        r#"
        SELECT 
            COALESCE(mens_bar_weight, bar_weight, 20.0) as "mens_bar_weight!: f64",
            COALESCE(womens_bar_weight, 15.0) as "womens_bar_weight!: f64"
        FROM contests
        WHERE id = ?
        "#,
        contest_id
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| AppError::DatabaseError(format!("Failed to get contest bar weight: {}", e)))?;

    match row {
        Some(row) => {
            let bar_weight = match gender {
                Some("Female") => row.womens_bar_weight,
                _ => row.mens_bar_weight, // Default to men's bar for Male or unknown gender
            };
            Ok(bar_weight)
        }
        None => Err(AppError::ContestNotFound {
            id: contest_id.to_string(),
        }),
    }
}

// Keep the original function for backward compatibility
pub async fn get_contest_bar_weight(
    pool: &Pool<Sqlite>,
    contest_id: &str,
) -> Result<f64, AppError> {
    // Default to men's bar weight for backward compatibility
    get_contest_bar_weight_by_gender(pool, contest_id, Some("Male")).await
}

// Function to get both bar weights for UI configuration
pub async fn get_contest_bar_weights(
    pool: &Pool<Sqlite>,
    contest_id: &str,
) -> Result<(f64, f64), AppError> {
    let row = sqlx::query!(
        r#"
        SELECT 
            COALESCE(mens_bar_weight, bar_weight, 20.0) as "mens_bar_weight!: f64",
            COALESCE(womens_bar_weight, 15.0) as "womens_bar_weight!: f64"
        FROM contests
        WHERE id = ?
        "#,
        contest_id
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| AppError::DatabaseError(format!("Failed to get contest bar weights: {}", e)))?;

    match row {
        Some(row) => Ok((row.mens_bar_weight, row.womens_bar_weight)),
        None => Err(AppError::ContestNotFound {
            id: contest_id.to_string(),
        }),
    }
}

// Function to update both bar weights for a contest
pub async fn update_contest_bar_weights(
    pool: &Pool<Sqlite>,
    contest_id: &str,
    mens_bar_weight: f64,
    womens_bar_weight: f64,
) -> Result<(), AppError> {
    // Validate input using constants
    if mens_bar_weight <= MIN_BAR_WEIGHT || womens_bar_weight <= MIN_BAR_WEIGHT {
        return Err(AppError::ValidationError(
            "Bar weights must be positive".to_string(),
        ));
    }

    if mens_bar_weight > MAX_BAR_WEIGHT || womens_bar_weight > MAX_BAR_WEIGHT {
        return Err(AppError::ValidationError(format!(
            "Bar weights cannot exceed {}kg",
            MAX_BAR_WEIGHT
        )));
    }

    // Check increment validation using proper floating point arithmetic
    let increment_multiplier = 1.0 / WEIGHT_INCREMENT;
    let mens_check = (mens_bar_weight * increment_multiplier).fract().abs() < f64::EPSILON;
    let womens_check = (womens_bar_weight * increment_multiplier).fract().abs() < f64::EPSILON;

    if !mens_check || !womens_check {
        return Err(AppError::ValidationError(format!(
            "Bar weights must be in {}kg increments",
            WEIGHT_INCREMENT
        )));
    }

    let now = chrono::Utc::now().to_rfc3339();

    let result = sqlx::query!(
        r#"
        UPDATE contests
        SET mens_bar_weight = ?, womens_bar_weight = ?, updated_at = ?
        WHERE id = ?
        "#,
        mens_bar_weight,
        womens_bar_weight,
        now,
        contest_id
    )
    .execute(pool)
    .await
    .map_err(|e| AppError::DatabaseError(format!("Failed to update bar weights: {}", e)))?;

    if result.rows_affected() == 0 {
        return Err(AppError::ContestNotFound {
            id: contest_id.to_string(),
        });
    }

    Ok(())
}

pub async fn create_default_plate_sets_for_contest(
    pool: &Pool<Sqlite>,
    contest_id: &str,
) -> Result<Vec<PlateSet>, AppError> {
    let default_plates = [
        (25.0, 10),
        (20.0, 10),
        (15.0, 10),
        (10.0, 10),
        (5.0, 10),
        (2.5, 10),
        (1.25, 5),
        (0.5, 5),
        (0.25, 5),
    ];

    let mut created_plates = Vec::new();

    for (weight, quantity) in default_plates.iter() {
        let create_request = CreatePlateSet {
            contest_id: contest_id.to_string(),
            plate_weight: *weight,
            quantity: *quantity,
            color: "#DC2626".to_string(), // Red for 25kg
        };

        let created = create_plate_set(pool, create_request).await?;
        created_plates.push(created);
    }

    Ok(created_plates)
}

pub async fn get_plate_colors_for_contest(
    pool: &Pool<Sqlite>,
    contest_id: &str,
) -> Result<std::collections::HashMap<String, String>, AppError> {
    let plate_sets = sqlx::query!(
        r#"
        SELECT plate_weight, COALESCE(color, '#374151') as "color!: String"
        FROM plate_sets
        WHERE contest_id = ?
        ORDER BY plate_weight DESC
        "#,
        contest_id
    )
    .fetch_all(pool)
    .await
    .map_err(|e| AppError::DatabaseError(format!("Failed to get plate colors: {}", e)))?;

    let mut colors = std::collections::HashMap::new();
    for row in plate_sets {
        let weight_key = if row.plate_weight.fract() == 0.0 {
            format!("{}", row.plate_weight as i32)
        } else {
            format!("{}", row.plate_weight)
        };
        colors.insert(weight_key, row.color);
    }

    Ok(colors)
}

// Temporarily disabled due to SQLx offline mode issues
#[cfg(feature = "disabled-tests")]
mod tests {
    use super::*;
    use crate::database::{create_pool, run_migrations};

    async fn setup_test_db() -> Pool<Sqlite> {
        let pool = create_pool("sqlite::memory:").await.unwrap();
        run_migrations(&pool).await.unwrap();
        pool
    }

    async fn create_test_contest(pool: &Pool<Sqlite>) -> String {
        let contest_id = uuid::Uuid::new_v4().to_string();
        sqlx::query!(
            "INSERT INTO contests (id, name, date, location, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            contest_id,
            "Test Contest",
            "2024-01-01",
            "Test Location",
            chrono::Utc::now().to_rfc3339(),
            chrono::Utc::now().to_rfc3339()
        )
        .execute(pool)
        .await
        .unwrap();
        contest_id
    }

    #[ignore] // Disabled until SQLx offline mode issue is resolved
    #[tokio::test]
    async fn test_plate_calculation_exact_weight() {
        let pool = setup_test_db().await;
        let contest_id = create_test_contest(&pool).await;

        // Create plate sets: 25kg, 10kg, 5kg, 2.5kg
        let plates = [
            CreatePlateSet {
                contest_id: contest_id.clone(),
                plate_weight: 25.0,
                quantity: 4,
                color: "#DC2626".to_string(), // Test color
            },
            CreatePlateSet {
                contest_id: contest_id.clone(),
                plate_weight: 10.0,
                quantity: 4,
                color: "#DC2626".to_string(), // Test color
            },
            CreatePlateSet {
                contest_id: contest_id.clone(),
                plate_weight: 5.0,
                quantity: 4,
                color: "#DC2626".to_string(), // Test color
            },
            CreatePlateSet {
                contest_id: contest_id.clone(),
                plate_weight: 2.5,
                quantity: 4,
                color: "#DC2626".to_string(), // Test color
            },
        ];

        for plate in plates {
            create_plate_set(&pool, plate).await.unwrap();
        }

        // Test 100kg total (40kg per side with 20kg bar)
        let result = calculate_plates_and_increment(&pool, &contest_id, 100.0)
            .await
            .unwrap();

        assert!(result.exact, "Should achieve exact weight");
        assert_eq!(result.total, 100.0, "Total should be 100kg");
        assert_eq!(result.increment, 5.0, "Increment should be 2.5kg * 2 = 5kg");
        assert!(!result.plates.is_empty(), "Should have plates");

        // Should use 1x25kg + 1x10kg + 1x5kg = 40kg per side
        let total_weight: f64 = result.plates.iter().map(|(w, c)| w * (*c as f64)).sum();
        assert_eq!(total_weight, 40.0, "Plates should sum to 40kg per side");
    }

    #[ignore] // Disabled until SQLx offline mode issue is resolved
    #[tokio::test]
    async fn test_plate_calculation_impossible_weight() {
        let pool = setup_test_db().await;
        let contest_id = create_test_contest(&pool).await;

        // Only create 25kg plates
        create_plate_set(
            &pool,
            CreatePlateSet {
                contest_id: contest_id.clone(),
                plate_weight: 25.0,
                quantity: 2,
                color: "#DC2626".to_string(), // Test color
            },
        )
        .await
        .unwrap();

        // Try to achieve 101kg (impossible with only 25kg plates)
        let result = calculate_plates_and_increment(&pool, &contest_id, 101.0)
            .await
            .unwrap();

        assert!(!result.exact, "Should not achieve exact weight");
        assert!(result.total < 101.0, "Total should be less than requested");
        assert_eq!(
            result.total, 100.0,
            "Should achieve 100kg (2x25kg per side + 20kg bar)"
        );
    }

    #[ignore] // Disabled until SQLx offline mode issue is resolved
    #[tokio::test]
    async fn test_increment_calculation() {
        let pool = setup_test_db().await;
        let contest_id = create_test_contest(&pool).await;

        // Create plates with smallest being 1.25kg
        let plates = [
            CreatePlateSet {
                contest_id: contest_id.clone(),
                plate_weight: 25.0,
                quantity: 2,
                color: "#DC2626".to_string(), // Test color
            },
            CreatePlateSet {
                contest_id: contest_id.clone(),
                plate_weight: 1.25,
                quantity: 4,
                color: "#16A34A".to_string(), // Green
            },
        ];

        for plate in plates {
            create_plate_set(&pool, plate).await.unwrap();
        }

        let result = calculate_plates_and_increment(&pool, &contest_id, 50.0)
            .await
            .unwrap();
        assert_eq!(
            result.increment, 2.5,
            "Increment should be 1.25kg * 2 = 2.5kg"
        );
    }

    #[ignore] // Disabled until SQLx offline mode issue is resolved
    #[tokio::test]
    async fn test_zero_weight_handling() {
        let pool = setup_test_db().await;
        let contest_id = create_test_contest(&pool).await;

        // Create some plates
        create_plate_set(
            &pool,
            CreatePlateSet {
                contest_id: contest_id.clone(),
                plate_weight: 25.0,
                quantity: 2,
                color: "#DC2626".to_string(), // Test color
            },
        )
        .await
        .unwrap();

        // Test zero weight (just the bar)
        let result = calculate_plates_and_increment(&pool, &contest_id, 0.0)
            .await
            .unwrap();

        assert!(result.exact, "Zero weight should be exact (just the bar)");
        assert_eq!(result.total, 20.0, "Should equal bar weight");
        assert!(result.plates.is_empty(), "Should have no plates");
    }

    #[ignore] // Disabled until SQLx offline mode issue is resolved
    #[tokio::test]
    async fn test_greedy_algorithm() {
        let pool = setup_test_db().await;
        let contest_id = create_test_contest(&pool).await;

        // Create plates: 20kg x2, 10kg x2, 5kg x2
        let plates = [
            CreatePlateSet {
                contest_id: contest_id.clone(),
                plate_weight: 20.0,
                quantity: 2,
                color: "#2563EB".to_string(), // Blue
            },
            CreatePlateSet {
                contest_id: contest_id.clone(),
                plate_weight: 10.0,
                quantity: 2,
                color: "#16A34A".to_string(), // Green
            },
            CreatePlateSet {
                contest_id: contest_id.clone(),
                plate_weight: 5.0,
                quantity: 2,
                color: "#F8FAFC".to_string(), // White
            },
        ];

        for plate in plates {
            create_plate_set(&pool, plate).await.unwrap();
        }

        // Test 85kg total (32.5kg per side) - should use 1x20kg + 1x10kg + 1x2.5kg wait, no 2.5kg plates!
        // Actually should use 1x20kg + 1x10kg + 1x5kg = 35kg per side = 90kg total
        let result = calculate_plates_and_increment(&pool, &contest_id, 85.0)
            .await
            .unwrap();

        // Should use largest plates first (greedy algorithm)
        assert!(!result.exact, "85kg not possible with these plates");
        assert!(
            result.plates.iter().any(|(w, _)| *w == 20.0),
            "Should use 20kg plates first"
        );
    }
}
