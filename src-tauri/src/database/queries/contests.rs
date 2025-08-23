use sqlx::{Pool, Sqlite, FromRow, Row};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Contest {
    pub id: String,
    pub name: String,
    pub date: String,
    pub location: String,
    pub discipline: String,
    pub status: String,
    pub federation_rules: Option<String>,
    pub competition_type: Option<String>,
    pub organizer: Option<String>,
    pub notes: Option<String>,
    pub is_archived: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateContestRequest {
    pub name: String,
    pub date: String,
    pub location: String,
    pub discipline: String,
    pub federation_rules: Option<String>,
    pub competition_type: Option<String>,
    pub organizer: Option<String>,
    pub notes: Option<String>,
}

/// Create a new contest (runtime-only queries for now)
pub async fn create_contest(
    pool: &Pool<Sqlite>,
    request: CreateContestRequest,
) -> Result<Contest, sqlx::Error> {
    let id = uuid::Uuid::new_v4().to_string();
    
    let row = sqlx::query(
        r#"
        INSERT INTO contests (id, name, date, location, discipline, federation_rules, competition_type, organizer, notes)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
        RETURNING id, name, date, location, discipline, status, federation_rules, competition_type, organizer, notes, is_archived, created_at, updated_at
        "#,
    )
    .bind(&id)
    .bind(&request.name)
    .bind(&request.date)
    .bind(&request.location)
    .bind(&request.discipline)
    .bind(&request.federation_rules)
    .bind(&request.competition_type)
    .bind(&request.organizer)
    .bind(&request.notes)
    .fetch_one(pool)
    .await?;

    Ok(Contest {
        id: row.try_get("id")?,
        name: row.try_get("name")?,
        date: row.try_get("date")?,
        location: row.try_get("location")?,
        discipline: row.try_get("discipline")?,
        status: row.try_get("status")?,
        federation_rules: row.try_get("federation_rules")?,
        competition_type: row.try_get("competition_type")?,
        organizer: row.try_get("organizer")?,
        notes: row.try_get("notes")?,
        is_archived: row.try_get("is_archived")?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}

/// Get contest by ID
pub async fn get_contest_by_id(
    pool: &Pool<Sqlite>,
    contest_id: &str,
) -> Result<Contest, sqlx::Error> {
    let row = sqlx::query(
        "SELECT id, name, date, location, discipline, status, federation_rules, competition_type, organizer, notes, is_archived, created_at, updated_at FROM contests WHERE id = ?1"
    )
    .bind(contest_id)
    .fetch_one(pool)
    .await?;

    Ok(Contest {
        id: row.try_get("id")?,
        name: row.try_get("name")?,
        date: row.try_get("date")?,
        location: row.try_get("location")?,
        discipline: row.try_get("discipline")?,
        status: row.try_get("status")?,
        federation_rules: row.try_get("federation_rules")?,
        competition_type: row.try_get("competition_type")?,
        organizer: row.try_get("organizer")?,
        notes: row.try_get("notes")?,
        is_archived: row.try_get("is_archived")?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}

/// Get all contests
pub async fn get_all_contests(pool: &Pool<Sqlite>) -> Result<Vec<Contest>, sqlx::Error> {
    let rows = sqlx::query(
        "SELECT id, name, date, location, discipline, status, federation_rules, competition_type, organizer, notes, is_archived, created_at, updated_at FROM contests ORDER BY created_at DESC"
    )
    .fetch_all(pool)
    .await?;

    let mut contests = Vec::new();
    for row in rows {
        contests.push(Contest {
            id: row.try_get("id")?,
            name: row.try_get("name")?,
            date: row.try_get("date")?,
            location: row.try_get("location")?,
            discipline: row.try_get("discipline")?,
            status: row.try_get("status")?,
            federation_rules: row.try_get("federation_rules")?,
            competition_type: row.try_get("competition_type")?,
            organizer: row.try_get("organizer")?,
            notes: row.try_get("notes")?,
            is_archived: row.try_get("is_archived")?,
            created_at: row.try_get("created_at")?,
            updated_at: row.try_get("updated_at")?,
        });
    }
    
    Ok(contests)
}

/// Update contest status
pub async fn update_contest_status(
    pool: &Pool<Sqlite>,
    contest_id: &str,
    status: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE contests SET status = ?1 WHERE id = ?2")
        .bind(status)
        .bind(contest_id)
        .execute(pool)
        .await?;
    
    Ok(())
}

/// Delete contest
pub async fn delete_contest(
    pool: &Pool<Sqlite>,
    contest_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM contests WHERE id = ?1")
        .bind(contest_id)
        .execute(pool)
        .await?;
    
    Ok(())
}