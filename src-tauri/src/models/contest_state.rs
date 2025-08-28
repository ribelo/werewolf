use crate::models::attempt::LiftType;
use serde::{Deserialize, Serialize};
use specta::Type;

use std::fmt;
use std::str::FromStr;

#[derive(Serialize, Deserialize, Type, Debug, Clone, PartialEq)]
#[serde(rename_all = "PascalCase")]
pub enum ContestStatus {
    Setup,        // Setting up contest, no registrations yet
    Registration, // Accepting competitor registrations
    InProgress,   // Contest running, tracking attempts
    Paused,       // Temporarily paused
    Complete,     // All attempts finished
}

impl fmt::Display for ContestStatus {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            ContestStatus::Setup => write!(f, "Setup"),
            ContestStatus::Registration => write!(f, "Registration"),
            ContestStatus::InProgress => write!(f, "InProgress"),
            ContestStatus::Paused => write!(f, "Paused"),
            ContestStatus::Complete => write!(f, "Complete"),
        }
    }
}

impl FromStr for ContestStatus {
    type Err = ();

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "Setup" => Ok(ContestStatus::Setup),
            "Registration" => Ok(ContestStatus::Registration),
            "InProgress" => Ok(ContestStatus::InProgress),
            "Paused" => Ok(ContestStatus::Paused),
            "Complete" => Ok(ContestStatus::Complete),
            _ => Err(()),
        }
    }
}

#[derive(Serialize, Deserialize, Type, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ContestState {
    pub contest_id: String,
    pub status: ContestStatus,
    pub current_lift: Option<LiftType>,
    pub current_round: i32, // 1st attempt, 2nd attempt, 3rd attempt
}
