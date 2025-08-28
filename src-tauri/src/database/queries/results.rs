use serde::{Deserialize, Serialize};
use sqlx::{FromRow, Pool, Row, Sqlite};

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct CompetitionResult {
    pub id: String,
    pub registration_id: String,
    pub contest_id: String,
    // Best lifts
    pub best_bench_press: Option<f64>,
    pub best_squat: Option<f64>,
    pub best_deadlift: Option<f64>,
    pub total_weight: f64,
    pub coefficient_points: f64,
    // Triple ranking support (based on CSV files)
    pub place_open: Option<i32>,
    pub place_in_age_class: Option<i32>,
    pub place_in_weight_class: Option<i32>,
    // Competition flags
    pub is_disqualified: bool,
    pub disqualification_reason: Option<String>,
    // Record tracking
    pub broke_record: bool,
    pub record_type: Option<String>,
    pub calculated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateResultRequest {
    pub registration_id: String,
    pub contest_id: String,
    pub best_bench_press: Option<f64>,
    pub best_squat: Option<f64>,
    pub best_deadlift: Option<f64>,
    pub is_disqualified: Option<bool>,
    pub disqualification_reason: Option<String>,
    pub broke_record: Option<bool>,
    pub record_type: Option<String>,
}

/// Calculate and create/update results for a registration
pub async fn calculate_results(
    pool: &Pool<Sqlite>,
    registration_id: &str,
) -> Result<CompetitionResult, sqlx::Error> {
    // Get registration with coefficients
    let reg_row = sqlx::query(
        "SELECT contest_id, reshel_coefficient, mccullough_coefficient FROM registrations WHERE id = ?1"
    )
    .bind(registration_id)
    .fetch_one(pool)
    .await?;

    let contest_id: String = reg_row.try_get("contest_id")?;
    let reshel: Option<f64> = reg_row.try_get("reshel_coefficient")?;
    let mccullough: Option<f64> = reg_row.try_get("mccullough_coefficient")?;

    // Get best lifts from attempts
    let best_bench = get_best_lift_weight(pool, registration_id, "BenchPress").await?;
    let best_squat = get_best_lift_weight(pool, registration_id, "Squat").await?;
    let best_deadlift = get_best_lift_weight(pool, registration_id, "Deadlift").await?;

    // Calculate total
    let total =
        (best_bench.unwrap_or(0.0)) + (best_squat.unwrap_or(0.0)) + (best_deadlift.unwrap_or(0.0));

    // Calculate coefficient points
    let coeff_points = total * reshel.unwrap_or(1.0) * mccullough.unwrap_or(1.0);

    // Create or update result
    let result_id = uuid::Uuid::new_v4().to_string();

    sqlx::query(
        r#"
        INSERT OR REPLACE INTO results 
        (id, registration_id, contest_id, best_bench_press, best_squat, best_deadlift, total_weight, coefficient_points)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
        "#
    )
    .bind(&result_id)
    .bind(registration_id)
    .bind(&contest_id)
    .bind(best_bench)
    .bind(best_squat)
    .bind(best_deadlift)
    .bind(total)
    .bind(coeff_points)
    .execute(pool)
    .await?;

    get_result_by_registration(pool, registration_id).await
}

/// Get result by registration ID
pub async fn get_result_by_registration(
    pool: &Pool<Sqlite>,
    registration_id: &str,
) -> Result<CompetitionResult, sqlx::Error> {
    let row = sqlx::query(
        r#"
        SELECT id, registration_id, contest_id, best_bench_press, best_squat, best_deadlift,
               total_weight, coefficient_points, place_open, place_in_age_class, place_in_weight_class,
               is_disqualified, disqualification_reason, broke_record, record_type, calculated_at
        FROM results WHERE registration_id = ?1
        "#
    )
    .bind(registration_id)
    .fetch_one(pool)
    .await?;

    Ok(CompetitionResult {
        id: row.try_get("id")?,
        registration_id: row.try_get("registration_id")?,
        contest_id: row.try_get("contest_id")?,
        best_bench_press: row.try_get("best_bench_press")?,
        best_squat: row.try_get("best_squat")?,
        best_deadlift: row.try_get("best_deadlift")?,
        total_weight: row.try_get("total_weight")?,
        coefficient_points: row.try_get("coefficient_points")?,
        place_open: row.try_get("place_open")?,
        place_in_age_class: row.try_get("place_in_age_class")?,
        place_in_weight_class: row.try_get("place_in_weight_class")?,
        is_disqualified: row.try_get("is_disqualified")?,
        disqualification_reason: row.try_get("disqualification_reason")?,
        broke_record: row.try_get("broke_record")?,
        record_type: row.try_get("record_type")?,
        calculated_at: row.try_get("calculated_at")?,
    })
}

/// Get all results for a contest
pub async fn get_contest_results(
    pool: &Pool<Sqlite>,
    contest_id: &str,
) -> Result<Vec<CompetitionResult>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT id, registration_id, contest_id, best_bench_press, best_squat, best_deadlift,
               total_weight, coefficient_points, place_open, place_in_age_class, place_in_weight_class,
               is_disqualified, disqualification_reason, broke_record, record_type, calculated_at
        FROM results 
        WHERE contest_id = ?1
        ORDER BY coefficient_points DESC
        "#
    )
    .bind(contest_id)
    .fetch_all(pool)
    .await?;

    let mut results = Vec::new();
    for row in rows {
        results.push(CompetitionResult {
            id: row.try_get("id")?,
            registration_id: row.try_get("registration_id")?,
            contest_id: row.try_get("contest_id")?,
            best_bench_press: row.try_get("best_bench_press")?,
            best_squat: row.try_get("best_squat")?,
            best_deadlift: row.try_get("best_deadlift")?,
            total_weight: row.try_get("total_weight")?,
            coefficient_points: row.try_get("coefficient_points")?,
            place_open: row.try_get("place_open")?,
            place_in_age_class: row.try_get("place_in_age_class")?,
            place_in_weight_class: row.try_get("place_in_weight_class")?,
            is_disqualified: row.try_get("is_disqualified")?,
            disqualification_reason: row.try_get("disqualification_reason")?,
            broke_record: row.try_get("broke_record")?,
            record_type: row.try_get("record_type")?,
            calculated_at: row.try_get("calculated_at")?,
        });
    }

    Ok(results)
}

pub async fn get_age_class_ranking(
    pool: &Pool<Sqlite>,
    contest_id: &str,
) -> Result<Vec<CompetitionResult>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT id, registration_id, contest_id, best_bench_press, best_squat, best_deadlift,
               total_weight, coefficient_points, place_open, place_in_age_class, place_in_weight_class,
               is_disqualified, disqualification_reason, broke_record, record_type, calculated_at
        FROM results
        WHERE contest_id = ?1 AND NOT is_disqualified
        ORDER BY place_in_age_class
        "#,
    )
    .bind(contest_id)
    .fetch_all(pool)
    .await?;

    let mut results = Vec::new();
    for row in rows {
        results.push(CompetitionResult {
            id: row.try_get("id")?,
            registration_id: row.try_get("registration_id")?,
            contest_id: row.try_get("contest_id")?,
            best_bench_press: row.try_get("best_bench_press")?,
            best_squat: row.try_get("best_squat")?,
            best_deadlift: row.try_get("best_deadlift")?,
            total_weight: row.try_get("total_weight")?,
            coefficient_points: row.try_get("coefficient_points")?,
            place_open: row.try_get("place_open")?,
            place_in_age_class: row.try_get("place_in_age_class")?,
            place_in_weight_class: row.try_get("place_in_weight_class")?,
            is_disqualified: row.try_get("is_disqualified")?,
            disqualification_reason: row.try_get("disqualification_reason")?,
            broke_record: row.try_get("broke_record")?,
            record_type: row.try_get("record_type")?,
            calculated_at: row.try_get("calculated_at")?,
        });
    }

    Ok(results)
}

pub async fn get_weight_class_ranking(
    pool: &Pool<Sqlite>,
    contest_id: &str,
) -> Result<Vec<CompetitionResult>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT id, registration_id, contest_id, best_bench_press, best_squat, best_deadlift,
               total_weight, coefficient_points, place_open, place_in_age_class, place_in_weight_class,
               is_disqualified, disqualification_reason, broke_record, record_type, calculated_at
        FROM results
        WHERE contest_id = ?1 AND NOT is_disqualified
        ORDER BY place_in_weight_class
        "#,
    )
    .bind(contest_id)
    .fetch_all(pool)
    .await?;

    let mut results = Vec::new();
    for row in rows {
        results.push(CompetitionResult {
            id: row.try_get("id")?,
            registration_id: row.try_get("registration_id")?,
            contest_id: row.try_get("contest_id")?,
            best_bench_press: row.try_get("best_bench_press")?,
            best_squat: row.try_get("best_squat")?,
            best_deadlift: row.try_get("best_deadlift")?,
            total_weight: row.try_get("total_weight")?,
            coefficient_points: row.try_get("coefficient_points")?,
            place_open: row.try_get("place_open")?,
            place_in_age_class: row.try_get("place_in_age_class")?,
            place_in_weight_class: row.try_get("place_in_weight_class")?,
            is_disqualified: row.try_get("is_disqualified")?,
            disqualification_reason: row.try_get("disqualification_reason")?,
            broke_record: row.try_get("broke_record")?,
            record_type: row.try_get("record_type")?,
            calculated_at: row.try_get("calculated_at")?,
        });
    }

    Ok(results)
}

/// Update all rankings for a contest (implements triple ranking system)
pub async fn update_all_rankings(pool: &Pool<Sqlite>, contest_id: &str) -> Result<(), sqlx::Error> {
    // 1. Update open rankings (overall)
    update_open_rankings(pool, contest_id).await?;

    // 2. Update age class rankings
    update_age_class_rankings(pool, contest_id).await?;

    // 3. Update weight class rankings
    update_weight_class_rankings(pool, contest_id).await?;

    Ok(())
}

/// Update open rankings (OPEN.csv equivalent)
async fn update_open_rankings(pool: &Pool<Sqlite>, contest_id: &str) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        UPDATE results 
        SET place_open = (
            SELECT COUNT(*) + 1 
            FROM results r2 
            WHERE r2.contest_id = results.contest_id 
            AND r2.coefficient_points > results.coefficient_points
            AND NOT r2.is_disqualified
        )
        WHERE contest_id = ?1 AND NOT is_disqualified
        "#,
    )
    .bind(contest_id)
    .execute(pool)
    .await?;

    Ok(())
}

/// Update age class rankings (KATEGORIE WIEKOWE.csv equivalent)
async fn update_age_class_rankings(
    pool: &Pool<Sqlite>,
    contest_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        UPDATE results 
        SET place_in_age_class = (
            SELECT COUNT(*) + 1 
            FROM results r2
            JOIN registrations reg2 ON reg2.id = r2.registration_id
            JOIN registrations reg1 ON reg1.id = results.registration_id
            WHERE r2.contest_id = results.contest_id 
            AND reg2.age_category_id = reg1.age_category_id
            AND r2.coefficient_points > results.coefficient_points
            AND NOT r2.is_disqualified
        )
        WHERE contest_id = ?1 AND NOT is_disqualified
        "#,
    )
    .bind(contest_id)
    .execute(pool)
    .await?;

    Ok(())
}

/// Update weight class rankings (KATEGORIE WAGOWE.csv equivalent)
async fn update_weight_class_rankings(
    pool: &Pool<Sqlite>,
    contest_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        UPDATE results 
        SET place_in_weight_class = (
            SELECT COUNT(*) + 1 
            FROM results r2
            JOIN registrations reg2 ON reg2.id = r2.registration_id
            JOIN registrations reg1 ON reg1.id = results.registration_id
            WHERE r2.contest_id = results.contest_id 
            AND reg2.weight_class_id = reg1.weight_class_id
            AND r2.coefficient_points > results.coefficient_points
            AND NOT r2.is_disqualified
        )
        WHERE contest_id = ?1 AND NOT is_disqualified
        "#,
    )
    .bind(contest_id)
    .execute(pool)
    .await?;

    Ok(())
}

/// Get rankings by type (for generating CSV-like reports)
pub async fn get_open_ranking(
    pool: &Pool<Sqlite>,
    contest_id: &str,
) -> Result<Vec<CompetitionResult>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT id, registration_id, contest_id, best_bench_press, best_squat, best_deadlift,
               total_weight, coefficient_points, place_open, place_in_age_class, place_in_weight_class,
               is_disqualified, disqualification_reason, broke_record, record_type, calculated_at
        FROM results 
        WHERE contest_id = ?1 AND NOT is_disqualified
        ORDER BY place_open
        "#
    )
    .bind(contest_id)
    .fetch_all(pool)
    .await?;

    let mut results = Vec::new();
    for row in rows {
        results.push(CompetitionResult {
            id: row.try_get("id")?,
            registration_id: row.try_get("registration_id")?,
            contest_id: row.try_get("contest_id")?,
            best_bench_press: row.try_get("best_bench_press")?,
            best_squat: row.try_get("best_squat")?,
            best_deadlift: row.try_get("best_deadlift")?,
            total_weight: row.try_get("total_weight")?,
            coefficient_points: row.try_get("coefficient_points")?,
            place_open: row.try_get("place_open")?,
            place_in_age_class: row.try_get("place_in_age_class")?,
            place_in_weight_class: row.try_get("place_in_weight_class")?,
            is_disqualified: row.try_get("is_disqualified")?,
            disqualification_reason: row.try_get("disqualification_reason")?,
            broke_record: row.try_get("broke_record")?,
            record_type: row.try_get("record_type")?,
            calculated_at: row.try_get("calculated_at")?,
        });
    }

    Ok(results)
}

/// Helper function to get best lift weight
async fn get_best_lift_weight(
    pool: &Pool<Sqlite>,
    registration_id: &str,
    lift_type: &str,
) -> Result<Option<f64>, sqlx::Error> {
    let row = sqlx::query(
        r#"
        SELECT MAX(weight) as best_weight
        FROM attempts 
        WHERE registration_id = ?1 AND lift_type = ?2 AND status = 'Good'
        "#,
    )
    .bind(registration_id)
    .bind(lift_type)
    .fetch_one(pool)
    .await?;

    row.try_get("best_weight")
}
