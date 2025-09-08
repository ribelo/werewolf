use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use strum::{Display, EnumString};

#[derive(Debug, Clone, Serialize, Deserialize, EnumString, Display, sqlx::Type, PartialEq)]
#[serde(rename_all = "PascalCase")]
#[strum(serialize_all = "PascalCase")]
#[sqlx(rename_all = "PascalCase")]
pub enum Discipline {
    Bench,
    Squat,
    Deadlift,
    Powerlifting,
}

#[derive(Debug, Clone, Serialize, Deserialize, EnumString, Display, sqlx::Type, PartialEq)]
#[serde(rename_all = "PascalCase")]
#[strum(serialize_all = "PascalCase")]
#[sqlx(rename_all = "PascalCase")]
pub enum ContestStatus {
    Setup,
    InProgress,
    Paused,
    Completed,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Contest {
    pub id: String,
    pub name: String,
    pub date: NaiveDate,
    pub location: String,
    pub discipline: Discipline,
    pub status: ContestStatus,
    pub federation_rules: Option<String>,
    pub competition_type: Option<String>,
    pub organizer: Option<String>,
    pub notes: Option<String>,
    pub is_archived: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct NewContest {
    pub name: String,
    pub date: NaiveDate,
    pub location: String,
    pub discipline: Discipline,
    pub federation_rules: Option<String>,
    pub competition_type: Option<String>,
    pub organizer: Option<String>,
    pub notes: Option<String>,
}
