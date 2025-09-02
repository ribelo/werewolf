use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Serialize, Deserialize, Type, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Competitor {
    pub id: String,
    pub first_name: String,
    pub last_name: String,
    pub birth_date: String,
    pub gender: String,
    pub club: Option<String>,
    pub city: Option<String>,
    pub notes: Option<String>,
    pub competition_order: i64,
    pub photo_base64: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Type, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CompetitorCreate {
    pub first_name: String,
    pub last_name: String,
    pub birth_date: String,
    pub gender: String,
    pub photo_base64: Option<String>,
    pub photo_filename: Option<String>,
}
