use serde::{Deserialize, Serialize};
use specta::Type;
use strum::{Display, EnumString};

#[derive(Serialize, Deserialize, Type, Debug, Clone, PartialEq, Display, EnumString)]
#[serde(rename_all = "PascalCase")]
#[strum(serialize_all = "PascalCase")]
pub enum LiftType {
    Squat,
    Bench,
    Deadlift,
}

#[derive(Serialize, Deserialize, Type, Debug, Clone, PartialEq, Display, EnumString)]
#[serde(rename_all = "PascalCase")]
#[strum(serialize_all = "PascalCase")]
pub enum AttemptStatus {
    Pending,
    Successful,
    Failed,
    Skipped,
}

#[derive(Serialize, Deserialize, Type, Debug, Clone, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Attempt {
    pub id: String,
    pub registration_id: String,
    pub lift_type: LiftType,
    pub attempt_number: i32,
    pub weight: f64,
    pub status: AttemptStatus,
    pub timestamp: Option<String>,
    pub judge1_decision: Option<bool>,
    pub judge2_decision: Option<bool>,
    pub judge3_decision: Option<bool>,
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Type, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AttemptUpsert {
    pub registration_id: String,
    pub lift_type: LiftType,
    pub attempt_number: i32,
    pub weight: f64,
}

#[derive(Serialize, Deserialize, Type, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AttemptUpdateResult {
    pub attempt_id: String,
    pub status: AttemptStatus,
}
