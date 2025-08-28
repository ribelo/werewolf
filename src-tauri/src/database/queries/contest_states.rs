use crate::models::attempt::LiftType;
use crate::models::contest_state::{ContestState, ContestStatus};
use sqlx::{FromRow, Pool, Sqlite};
use std::str::FromStr;

#[derive(FromRow, Debug)]
pub struct DbContestState {
    pub contest_id: String,
    pub status: String,
    pub current_lift: Option<String>,
    pub current_round: i32,
}

// Helper to convert DbContestState to ContestState
impl TryFrom<DbContestState> for ContestState {
    type Error = sqlx::Error;

    fn try_from(db_state: DbContestState) -> Result<Self, Self::Error> {
        Ok(ContestState {
            contest_id: db_state.contest_id,
            status: ContestStatus::from_str(&db_state.status)
                .map_err(|_| sqlx::Error::Decode("Invalid ContestStatus".into()))?,
            current_lift: db_state
                .current_lift
                .and_then(|s| LiftType::from_str(&s).ok()),
            current_round: db_state.current_round,
        })
    }
}

pub async fn get_contest_state(
    pool: &Pool<Sqlite>,
    contest_id: &str,
) -> Result<Option<ContestState>, sqlx::Error> {
    let db_state = sqlx::query_as::<_, DbContestState>(
        "SELECT * FROM contest_states WHERE contest_id = ?",
    )
    .bind(contest_id)
    .fetch_optional(pool)
    .await?;

    match db_state {
        Some(db_state) => Ok(Some(db_state.try_into()?)),
        None => Ok(None),
    }
}

pub async fn upsert_contest_state(
    pool: &Pool<Sqlite>,
    state: &ContestState,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO contest_states (contest_id, status, current_lift, current_round)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(contest_id) DO UPDATE SET
            status = excluded.status,
            current_lift = excluded.current_lift,
            current_round = excluded.current_round
        "#,
    )
    .bind(&state.contest_id)
    .bind(state.status.to_string())
    .bind(state.current_lift.as_ref().map(|lt| lt.to_string()))
    .bind(state.current_round)
    .execute(pool)
    .await?;

    Ok(())
}
