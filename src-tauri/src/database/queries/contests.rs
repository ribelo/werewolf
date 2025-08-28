use crate::models::contest::{Contest, NewContest};
use sqlx::{Pool, Sqlite};
use uuid::Uuid;

/// Create a new contest and return the created record.
pub async fn create_contest(
    pool: &Pool<Sqlite>,
    new_contest: NewContest,
) -> Result<Contest, sqlx::Error> {
    let id = Uuid::new_v4().to_string();
    let discipline_str = new_contest.discipline.to_string();

    sqlx::query(
        r#"
        INSERT INTO contests (id, name, date, location, discipline, federation_rules, competition_type, organizer, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&id)
    .bind(&new_contest.name)
    .bind(new_contest.date)
    .bind(&new_contest.location)
    .bind(&discipline_str)
    .bind(&new_contest.federation_rules)
    .bind(&new_contest.competition_type)
    .bind(&new_contest.organizer)
    .bind(&new_contest.notes)
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
    sqlx::query_as(
        r#"
        SELECT id, name, date, location, discipline, status, federation_rules, competition_type, organizer, notes, is_archived, created_at, updated_at
        FROM contests
        WHERE id = ?
        "#,
    )
    .bind(contest_id)
    .fetch_optional(pool)
    .await
}

/// Get all contests from the database.
pub async fn get_all_contests(pool: &Pool<Sqlite>) -> Result<Vec<Contest>, sqlx::Error> {
    sqlx::query_as(
        r#"
        SELECT id, name, date, location, discipline, status, federation_rules, competition_type, organizer, notes, is_archived, created_at, updated_at
        FROM contests
        ORDER BY date DESC
        "#,
    )
    .fetch_all(pool)
    .await
}

/// Update an existing contest.
pub async fn update_contest(
    pool: &Pool<Sqlite>,
    contest_id: &str,
    contest: Contest,
) -> Result<Contest, sqlx::Error> {
    let discipline_str = contest.discipline.to_string();
    let status_str = contest.status.to_string();

    sqlx::query(
        r#"
        UPDATE contests
        SET name = ?, date = ?, location = ?, discipline = ?, status = ?, federation_rules = ?, competition_type = ?, organizer = ?, notes = ?, is_archived = ?
        WHERE id = ?
        "#,
    )
    .bind(&contest.name)
    .bind(contest.date)
    .bind(&contest.location)
    .bind(&discipline_str)
    .bind(&status_str)
    .bind(&contest.federation_rules)
    .bind(&contest.competition_type)
    .bind(&contest.organizer)
    .bind(&contest.notes)
    .bind(contest.is_archived)
    .bind(contest_id)
    .execute(pool)
    .await?;

    get_contest_by_id(pool, contest_id)
        .await?
        .ok_or_else(|| sqlx::Error::RowNotFound)
}

/// Delete a contest by its ID.
pub async fn delete_contest(pool: &Pool<Sqlite>, contest_id: &str) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM contests WHERE id = ?")
        .bind(contest_id)
        .execute(pool)
        .await?;
    Ok(())
}
