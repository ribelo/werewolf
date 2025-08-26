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
}

#[derive(Serialize, Deserialize, Type, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CompetitorCreate {
    pub first_name: String,
    pub last_name: String,
    pub birth_date: String,
    pub gender: String,
}
