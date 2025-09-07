use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Serialize, Deserialize, Type, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PlateSet {
    pub id: String,
    pub contest_id: String,
    pub plate_weight: f64,
    pub quantity: i32,
    pub color: String, // Required hex color code (e.g. "#DC2626")
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Type, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CreatePlateSet {
    pub contest_id: String,
    pub plate_weight: f64,
    pub quantity: i32,
    pub color: String, // Required hex color code
}

// Simple response for plate calculations - just what's needed
#[derive(Serialize, Deserialize, Type, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PlateCalculation {
    pub plates: Vec<(f64, usize)>, // (weight, count) pairs for one side
    pub exact: bool,               // Can achieve exact weight
    pub total: f64,                // Actual achievable weight
    pub increment: f64,            // Minimum increment for this contest
    pub target_weight: f64,        // The requested weight
    pub bar_weight: f64,           // Bar weight used in calculation
}
