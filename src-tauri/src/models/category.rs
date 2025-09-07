use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct WeightClass {
    pub id: String,
    pub gender: String,
    pub name: String,
    #[serde(rename = "minWeight")]
    pub weight_min: Option<f64>,
    #[serde(rename = "maxWeight")]
    pub weight_max: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct AgeCategory {
    pub id: String,
    pub name: String,
    #[serde(rename = "minAge")]
    pub min_age: Option<i64>,
    #[serde(rename = "maxAge")]
    pub max_age: Option<i64>,
}
