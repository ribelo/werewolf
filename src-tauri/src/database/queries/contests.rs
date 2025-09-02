use crate::models::contest::{Contest, ContestStatus, Discipline, NewContest};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, Pool, Sqlite};
use std::str::FromStr;
use uuid::Uuid;

// Database-specific Contest struct that matches SQLite types exactly
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct DbContest {
    pub id: String,
    pub name: String,
    pub date: String, // SQLite stores as TEXT
    pub location: String,
    pub discipline: String, // SQLite stores as TEXT
    pub status: String,     // SQLite stores as TEXT
    pub federation_rules: Option<String>,
    pub competition_type: Option<String>,
    pub organizer: Option<String>,
    pub notes: Option<String>,
    pub is_archived: bool,
    pub created_at: String,
    pub updated_at: String,
}

// Convert database contest to model contest
impl From<DbContest> for Contest {
    fn from(db_contest: DbContest) -> Self {
        Contest {
            id: db_contest.id,
            name: db_contest.name,
            date: chrono::NaiveDate::parse_from_str(&db_contest.date, "%Y-%m-%d")
                .unwrap_or_else(|_| chrono::NaiveDate::from_ymd_opt(1900, 1, 1).unwrap()),
            location: db_contest.location,
            discipline: Discipline::from_str(&db_contest.discipline)
                .unwrap_or(Discipline::Powerlifting),
            status: ContestStatus::from_str(&db_contest.status).unwrap_or(ContestStatus::Setup),
            federation_rules: db_contest.federation_rules,
            competition_type: db_contest.competition_type,
            organizer: db_contest.organizer,
            notes: db_contest.notes,
            is_archived: db_contest.is_archived,
            created_at: db_contest.created_at,
            updated_at: db_contest.updated_at,
        }
    }
}

/// Create a new contest and return the created record.
pub async fn create_contest(
    pool: &Pool<Sqlite>,
    new_contest: NewContest,
) -> Result<Contest, sqlx::Error> {
    let id = Uuid::new_v4().to_string();
    let discipline_str = new_contest.discipline.to_string();

    sqlx::query!(
        r#"
        INSERT INTO contests (id, name, date, location, discipline, federation_rules, competition_type, organizer, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
        id,
        new_contest.name,
        new_contest.date,
        new_contest.location,
        discipline_str,
        new_contest.federation_rules,
        new_contest.competition_type,
        new_contest.organizer,
        new_contest.notes
    )
    .execute(pool)
    .await?;

    get_contest_by_id(pool, &id)
        .await?
        .ok_or_else(|| sqlx::Error::RowNotFound)
}

/// Get a single contest by its ID.
pub async fn get_contest_by_id(
    pool: &Pool<Sqlite>,
    contest_id: &str,
) -> Result<Option<Contest>, sqlx::Error> {
    let db_contest = sqlx::query_as!(
        DbContest,
        r#"
        SELECT 
            id as "id!", 
            name as "name!", 
            date as "date!", 
            location as "location!", 
            discipline as "discipline!", 
            status as "status!", 
            federation_rules, 
            competition_type, 
            organizer, 
            notes, 
            is_archived as "is_archived!", 
            created_at as "created_at!", 
            updated_at as "updated_at!"
        FROM contests
        WHERE id = ?
        "#,
        contest_id
    )
    .fetch_optional(pool)
    .await?;

    Ok(db_contest.map(|c| c.into()))
}

/// Get all contests from the database.
pub async fn get_all_contests(pool: &Pool<Sqlite>) -> Result<Vec<Contest>, sqlx::Error> {
    let db_contests = sqlx::query_as!(
        DbContest,
        r#"
        SELECT 
            id as "id!", 
            name as "name!", 
            date as "date!", 
            location as "location!", 
            discipline as "discipline!", 
            status as "status!", 
            federation_rules, 
            competition_type, 
            organizer, 
            notes, 
            is_archived as "is_archived!", 
            created_at as "created_at!", 
            updated_at as "updated_at!"
        FROM contests
        ORDER BY date DESC
        "#
    )
    .fetch_all(pool)
    .await?;

    Ok(db_contests.into_iter().map(|c| c.into()).collect())
}

/// Update an existing contest.
pub async fn update_contest(
    pool: &Pool<Sqlite>,
    contest_id: &str,
    contest: Contest,
) -> Result<Contest, sqlx::Error> {
    let discipline_str = contest.discipline.to_string();
    let status_str = contest.status.to_string();

    sqlx::query!(
        r#"
        UPDATE contests
        SET name = ?, date = ?, location = ?, discipline = ?, status = ?, federation_rules = ?, competition_type = ?, organizer = ?, notes = ?, is_archived = ?
        WHERE id = ?
        "#,
        contest.name,
        contest.date,
        contest.location,
        discipline_str,
        status_str,
        contest.federation_rules,
        contest.competition_type,
        contest.organizer,
        contest.notes,
        contest.is_archived,
        contest_id
    )
    .execute(pool)
    .await?;

    get_contest_by_id(pool, contest_id)
        .await?
        .ok_or_else(|| sqlx::Error::RowNotFound)
}

/// Delete a contest by its ID.
pub async fn delete_contest(pool: &Pool<Sqlite>, contest_id: &str) -> Result<(), sqlx::Error> {
    sqlx::query!("DELETE FROM contests WHERE id = ?", contest_id)
        .execute(pool)
        .await?;
    Ok(())
}
