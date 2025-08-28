use serde::{Deserialize, Serialize};
use sqlx::{FromRow, Pool, Row, Sqlite};

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Attempt {
    pub id: String,
    pub registration_id: String,
    pub lift_type: String,
    pub attempt_number: i32,
    pub weight: f64,
    pub status: String,
    pub timestamp: Option<String>,
    pub judge1_decision: Option<bool>,
    pub judge2_decision: Option<bool>,
    pub judge3_decision: Option<bool>,
    pub notes: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateAttemptRequest {
    pub registration_id: String,
    pub lift_type: String,
    pub attempt_number: i32,
    pub weight: f64,
    pub status: Option<String>,
    pub judge1_decision: Option<bool>,
    pub judge2_decision: Option<bool>,
    pub judge3_decision: Option<bool>,
    pub notes: Option<String>,
}

/// Upsert an attempt's weight.
/// Creates a new attempt if one doesn't exist for the given registration, lift type, and attempt number.
/// Otherwise, it updates the weight of the existing attempt.
pub async fn upsert_attempt_weight(
    pool: &Pool<Sqlite>,
    registration_id: &str,
    lift_type: &str,
    attempt_number: i32,
    weight: f64,
) -> Result<(), sqlx::Error> {
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        r#"
        INSERT INTO attempts (id, registration_id, lift_type, attempt_number, weight, status)
        VALUES (?1, ?2, ?3, ?4, ?5, 'Pending')
        ON CONFLICT(registration_id, lift_type, attempt_number) DO UPDATE SET
        weight = excluded.weight
        "#,
    )
    .bind(&id)
    .bind(registration_id)
    .bind(lift_type)
    .bind(attempt_number)
    .bind(weight)
    .execute(pool)
    .await?;

    Ok(())
}

/// Record a new attempt
pub async fn record_attempt(
    pool: &Pool<Sqlite>,
    request: CreateAttemptRequest,
) -> Result<Attempt, sqlx::Error> {
    let id = uuid::Uuid::new_v4().to_string();
    let status = request.status.unwrap_or_else(|| "Pending".to_string());

    let row = sqlx::query(
        r#"
        INSERT INTO attempts (id, registration_id, lift_type, attempt_number, weight, status, judge1_decision, judge2_decision, judge3_decision, notes)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
        RETURNING id, registration_id, lift_type, attempt_number, weight, status, timestamp, judge1_decision, judge2_decision, judge3_decision, notes, created_at
        "#,
    )
    .bind(&id)
    .bind(&request.registration_id)
    .bind(&request.lift_type)
    .bind(request.attempt_number)
    .bind(request.weight)
    .bind(&status)
    .bind(request.judge1_decision)
    .bind(request.judge2_decision)
    .bind(request.judge3_decision)
    .bind(&request.notes)
    .fetch_one(pool)
    .await?;

    Ok(Attempt {
        id: row.try_get("id")?,
        registration_id: row.try_get("registration_id")?,
        lift_type: row.try_get("lift_type")?,
        attempt_number: row.try_get("attempt_number")?,
        weight: row.try_get("weight")?,
        status: row.try_get("status")?,
        timestamp: row.try_get("timestamp")?,
        judge1_decision: row.try_get("judge1_decision")?,
        judge2_decision: row.try_get("judge2_decision")?,
        judge3_decision: row.try_get("judge3_decision")?,
        notes: row.try_get("notes")?,
        created_at: row.try_get("created_at")?,
    })
}

/// Get all attempts for a registration
pub async fn get_attempts_by_registration(
    pool: &Pool<Sqlite>,
    registration_id: &str,
) -> Result<Vec<Attempt>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT id, registration_id, lift_type, attempt_number, weight, status, timestamp,
               judge1_decision, judge2_decision, judge3_decision, notes, created_at
        FROM attempts 
        WHERE registration_id = ?1 
        ORDER BY lift_type, attempt_number
        "#,
    )
    .bind(registration_id)
    .fetch_all(pool)
    .await?;

    let mut attempts = Vec::new();
    for row in rows {
        attempts.push(Attempt {
            id: row.try_get("id")?,
            registration_id: row.try_get("registration_id")?,
            lift_type: row.try_get("lift_type")?,
            attempt_number: row.try_get("attempt_number")?,
            weight: row.try_get("weight")?,
            status: row.try_get("status")?,
            timestamp: row.try_get("timestamp")?,
            judge1_decision: row.try_get("judge1_decision")?,
            judge2_decision: row.try_get("judge2_decision")?,
            judge3_decision: row.try_get("judge3_decision")?,
            notes: row.try_get("notes")?,
            created_at: row.try_get("created_at")?,
        });
    }

    Ok(attempts)
}

/// Get attempts by lift type for a registration
pub async fn get_attempts_by_lift_type(
    pool: &Pool<Sqlite>,
    registration_id: &str,
    lift_type: &str,
) -> Result<Vec<Attempt>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT id, registration_id, lift_type, attempt_number, weight, status, timestamp,
               judge1_decision, judge2_decision, judge3_decision, notes, created_at
        FROM attempts 
        WHERE registration_id = ?1 AND lift_type = ?2
        ORDER BY attempt_number
        "#,
    )
    .bind(registration_id)
    .bind(lift_type)
    .fetch_all(pool)
    .await?;

    let mut attempts = Vec::new();
    for row in rows {
        attempts.push(Attempt {
            id: row.try_get("id")?,
            registration_id: row.try_get("registration_id")?,
            lift_type: row.try_get("lift_type")?,
            attempt_number: row.try_get("attempt_number")?,
            weight: row.try_get("weight")?,
            status: row.try_get("status")?,
            timestamp: row.try_get("timestamp")?,
            judge1_decision: row.try_get("judge1_decision")?,
            judge2_decision: row.try_get("judge2_decision")?,
            judge3_decision: row.try_get("judge3_decision")?,
            notes: row.try_get("notes")?,
            created_at: row.try_get("created_at")?,
        });
    }

    Ok(attempts)
}

/// Update attempt status and judge decisions
pub async fn update_attempt_result(
    pool: &Pool<Sqlite>,
    attempt_id: &str,
    status: &str,
    judge1: Option<bool>,
    judge2: Option<bool>,
    judge3: Option<bool>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        UPDATE attempts 
        SET status = ?1, judge1_decision = ?2, judge2_decision = ?3, judge3_decision = ?4, timestamp = CURRENT_TIMESTAMP
        WHERE id = ?5
        "#
    )
    .bind(status)
    .bind(judge1)
    .bind(judge2)
    .bind(judge3)
    .bind(attempt_id)
    .execute(pool)
    .await?;

    Ok(())
}

/// Get best successful attempt for a lift type
pub async fn get_best_attempt(
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

/// Get all attempts for a contest (for display purposes)
pub async fn get_contest_attempts(
    pool: &Pool<Sqlite>,
    contest_id: &str,
) -> Result<Vec<Attempt>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT a.id, a.registration_id, a.lift_type, a.attempt_number, a.weight, a.status, a.timestamp,
               a.judge1_decision, a.judge2_decision, a.judge3_decision, a.notes, a.created_at
        FROM attempts a
        JOIN registrations r ON r.id = a.registration_id
        WHERE r.contest_id = ?1
        ORDER BY a.lift_type, a.attempt_number, a.created_at
        "#
    )
    .bind(contest_id)
    .fetch_all(pool)
    .await?;

    let mut attempts = Vec::new();
    for row in rows {
        attempts.push(Attempt {
            id: row.try_get("id")?,
            registration_id: row.try_get("registration_id")?,
            lift_type: row.try_get("lift_type")?,
            attempt_number: row.try_get("attempt_number")?,
            weight: row.try_get("weight")?,
            status: row.try_get("status")?,
            timestamp: row.try_get("timestamp")?,
            judge1_decision: row.try_get("judge1_decision")?,
            judge2_decision: row.try_get("judge2_decision")?,
            judge3_decision: row.try_get("judge3_decision")?,
            notes: row.try_get("notes")?,
            created_at: row.try_get("created_at")?,
        });
    }

    Ok(attempts)
}

/// Get a single attempt by its ID
pub async fn get_attempt_by_id(
    pool: &Pool<Sqlite>,
    attempt_id: &str,
) -> Result<Option<Attempt>, sqlx::Error> {
    sqlx::query_as::<_, Attempt>("SELECT * FROM attempts WHERE id = ?")
        .bind(attempt_id)
        .fetch_optional(pool)
        .await
}

pub async fn get_current_attempt(
    pool: &Pool<Sqlite>,
    contest_id: &str,
) -> Result<Option<Attempt>, sqlx::Error> {
    let current_lift_row = sqlx::query(
        "SELECT registration_id, lift_type, attempt_number FROM current_lifts WHERE contest_id = ?",
    )
    .bind(contest_id)
    .fetch_optional(pool)
    .await?;

    if let Some(row) = current_lift_row {
        let registration_id: String = row.try_get("registration_id")?;
        let lift_type: String = row.try_get("lift_type")?;
        let attempt_number: i32 = row.try_get("attempt_number")?;

        sqlx::query_as::<_, Attempt>(
            "SELECT * FROM attempts WHERE registration_id = ? AND lift_type = ? AND attempt_number = ?",
        )
        .bind(registration_id)
        .bind(lift_type)
        .bind(attempt_number)
        .fetch_optional(pool)
        .await
    } else {
        Ok(None)
    }
}

/// Get the queue of next attempts for a given lift and round.
pub async fn get_next_attempts_in_queue(
    pool: &Pool<Sqlite>,
    contest_id: &str,
    lift_type: &str,
    round: i32,
) -> Result<Vec<Attempt>, sqlx::Error> {
    sqlx::query_as::<_, Attempt>(
        r#"
        SELECT a.*
        FROM attempts a
        JOIN registrations r ON a.registration_id = r.id
        WHERE r.contest_id = ? AND a.lift_type = ? AND a.attempt_number = ? AND a.status = 'Pending'
        ORDER BY a.weight ASC, r.lot_number ASC
        "#,
    )
    .bind(contest_id)
    .bind(lift_type)
    .bind(round)
    .fetch_all(pool)
    .await
}


/// Sets the current attempt for a contest. This uses the singleton `current_lifts` table.
pub async fn set_current_attempt(
    pool: &Pool<Sqlite>,
    contest_id: &str,
    attempt_id: &str,
) -> Result<(), sqlx::Error> {
    let attempt = get_attempt_by_id(pool, attempt_id)
        .await?
        .ok_or_else(|| sqlx::Error::RowNotFound)?;

    // The current_lifts table has a CHECK constraint forcing id to be 1.
    sqlx::query(
        r#"
        INSERT OR REPLACE INTO current_lifts (id, contest_id, registration_id, lift_type, attempt_number, weight)
        VALUES (1, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(contest_id)
    .bind(&attempt.registration_id)
    .bind(&attempt.lift_type)
    .bind(attempt.attempt_number)
    .bind(attempt.weight)
    .execute(pool)
    .await?;

    Ok(())
}


/// Delete attempt
pub async fn delete_attempt(pool: &Pool<Sqlite>, attempt_id: &str) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM attempts WHERE id = ?1")
        .bind(attempt_id)
        .execute(pool)
        .await?;

    Ok(())
}
