use serde::{Deserialize, Serialize};
use sqlx::{FromRow, Pool, Row, Sqlite};

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Competitor {
    pub id: String,
    pub first_name: String,
    pub last_name: String,
    pub birth_date: String, // YYYY-MM-DD format
    pub gender: String,
    pub club: Option<String>,
    pub city: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateCompetitorRequest {
    pub first_name: String,
    pub last_name: String,
    pub birth_date: String, // YYYY-MM-DD format
    pub gender: String,
    pub club: Option<String>,
    pub city: Option<String>,
    pub notes: Option<String>,
}

/// Create a new competitor
pub async fn create_competitor(
    pool: &Pool<Sqlite>,
    request: CreateCompetitorRequest,
) -> Result<Competitor, sqlx::Error> {
    let id = uuid::Uuid::new_v4().to_string();

    let row = sqlx::query(
        r#"
        INSERT INTO competitors (id, first_name, last_name, birth_date, gender, club, city, notes)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
        RETURNING id, first_name, last_name, birth_date, gender, club, city, notes, created_at, updated_at
        "#,
    )
    .bind(&id)
    .bind(&request.first_name)
    .bind(&request.last_name)
    .bind(&request.birth_date)
    .bind(&request.gender)
    .bind(&request.club)
    .bind(&request.city)
    .bind(&request.notes)
    .fetch_one(pool)
    .await?;

    Ok(Competitor {
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
    })
}

/// Get competitor by ID
pub async fn get_competitor_by_id(
    pool: &Pool<Sqlite>,
    competitor_id: &str,
) -> Result<Competitor, sqlx::Error> {
    let row = sqlx::query(
        "SELECT id, first_name, last_name, birth_date, gender, club, city, notes, created_at, updated_at FROM competitors WHERE id = ?1"
    )
    .bind(competitor_id)
    .fetch_one(pool)
    .await?;

    Ok(Competitor {
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
    })
}

/// Get all competitors
pub async fn get_all_competitors(pool: &Pool<Sqlite>) -> Result<Vec<Competitor>, sqlx::Error> {
    let rows = sqlx::query(
        "SELECT id, first_name, last_name, birth_date, gender, club, city, notes, created_at, updated_at FROM competitors ORDER BY last_name, first_name"
    )
    .fetch_all(pool)
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
pub async fn update_competitor(
    pool: &Pool<Sqlite>,
    competitor_id: &str,
    request: CreateCompetitorRequest,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        UPDATE competitors 
        SET first_name = ?1, last_name = ?2, birth_date = ?3, gender = ?4, club = ?5, city = ?6, notes = ?7
        WHERE id = ?8
        "#
    )
    .bind(&request.first_name)
    .bind(&request.last_name)
    .bind(&request.birth_date)
    .bind(&request.gender)
    .bind(&request.club)
    .bind(&request.city)
    .bind(&request.notes)
    .bind(competitor_id)
    .execute(pool)
    .await?;

    Ok(())
}

/// Delete competitor
pub async fn delete_competitor(
    pool: &Pool<Sqlite>,
    competitor_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM competitors WHERE id = ?1")
        .bind(competitor_id)
        .execute(pool)
        .await?;

    Ok(())
}
