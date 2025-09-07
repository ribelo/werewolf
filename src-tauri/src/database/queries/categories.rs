use crate::models::category::{AgeCategory, WeightClass};
use sqlx::{Pool, Sqlite};

pub async fn get_weight_classes(pool: &Pool<Sqlite>) -> Result<Vec<WeightClass>, sqlx::Error> {
    let weight_classes = sqlx::query_as::<_, WeightClass>(
        r#"
        SELECT id, gender, name, weight_min, weight_max 
        FROM weight_classes 
        ORDER BY gender, weight_max ASC NULLS LAST
        "#,
    )
    .fetch_all(pool)
    .await?;

    Ok(weight_classes)
}

pub async fn get_age_categories(pool: &Pool<Sqlite>) -> Result<Vec<AgeCategory>, sqlx::Error> {
    let age_categories = sqlx::query_as::<_, AgeCategory>(
        r#"
        SELECT id, name, min_age, max_age 
        FROM age_categories 
        ORDER BY min_age ASC NULLS FIRST
        "#,
    )
    .fetch_all(pool)
    .await?;

    Ok(age_categories)
}
