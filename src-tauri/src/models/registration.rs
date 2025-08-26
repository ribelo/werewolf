use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Serialize, Deserialize, Type, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Registration {
    pub id: String,
    pub contest_id: String,
    pub competitor_id: String,
    pub bodyweight: f64,
}

#[derive(Serialize, Deserialize, Type, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RegistrationCreate {
    pub contest_id: String,
    pub competitor_id: String,
    pub bodyweight: f64,
}
