use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Serialize, Deserialize, Type, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Registration {
    pub id: String,
    pub contest_id: String,
    pub competitor_id: String,
    pub age_category_id: String,
    pub weight_class_id: String,
    // Equipment flags
    pub equipment_m: bool,
    pub equipment_sm: bool,
    pub equipment_t: bool,
    // Day-of data
    pub bodyweight: f64,
    pub lot_number: Option<String>,
    pub personal_record_at_entry: Option<f64>,
    // Calculated coefficients
    pub reshel_coefficient: Option<f64>,
    pub mccullough_coefficient: Option<f64>,
    // Rack heights
    pub rack_height_squat: Option<i32>,
    pub rack_height_bench: Option<i32>,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Type, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RegistrationCreate {
    pub contest_id: String,
    pub competitor_id: String,
    pub bodyweight: f64,
    pub age_category_id: Option<String>,
    pub weight_class_id: Option<String>,
    // Equipment flags
    pub equipment_m: Option<bool>,
    pub equipment_sm: Option<bool>,
    pub equipment_t: Option<bool>,
    // Additional data
    pub lot_number: Option<String>,
    pub personal_record_at_entry: Option<f64>,
    pub rack_height_squat: Option<i32>,
    pub rack_height_bench: Option<i32>,
}
