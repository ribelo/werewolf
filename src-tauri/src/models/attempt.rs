use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Serialize, Deserialize, Type, Debug, Clone, PartialEq)]
#[serde(rename_all = "PascalCase")]
pub enum LiftType {
    Squat,
    Bench,
    Deadlift,
}

#[derive(Serialize, Deserialize, Type, Debug, Clone, PartialEq)]
#[serde(rename_all = "PascalCase")]
pub enum AttemptStatus {
    Pending,
    Successful,
    Failed,
}

#[derive(Serialize, Deserialize, Type, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Attempt {
    pub id: String,
    pub registration_id: String,
    pub lift_type: LiftType,
    pub attempt_number: i32,
    pub weight: f64,
    pub status: AttemptStatus,
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
