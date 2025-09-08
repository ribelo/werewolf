use serde::{Deserialize, Serialize};
use sqlx::{FromRow, Pool, Row, Sqlite};

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
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

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateRegistrationRequest {
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
    // Coefficients
    pub reshel_coefficient: Option<f64>,
    pub mccullough_coefficient: Option<f64>,
    // Rack heights
    pub rack_height_squat: Option<i32>,
    pub rack_height_bench: Option<i32>,
}

/// Create a new registration
pub async fn create_registration(
    pool: &Pool<Sqlite>,
    request: CreateRegistrationRequest,
) -> Result<Registration, sqlx::Error> {
    let id = uuid::Uuid::new_v4().to_string();

    let row = sqlx::query(
        r#"
        INSERT INTO registrations (
            id, contest_id, competitor_id, age_category_id, weight_class_id,
            equipment_m, equipment_sm, equipment_t, bodyweight, lot_number, 
            personal_record_at_entry, reshel_coefficient, mccullough_coefficient,
            rack_height_squat, rack_height_bench
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
        RETURNING id, contest_id, competitor_id, age_category_id, weight_class_id,
                  equipment_m, equipment_sm, equipment_t, bodyweight, lot_number,
                  personal_record_at_entry, reshel_coefficient, mccullough_coefficient,
                  rack_height_squat, rack_height_bench, created_at
        "#,
    )
    .bind(&id)
    .bind(&request.contest_id)
    .bind(&request.competitor_id)
    .bind(&request.age_category_id)
    .bind(&request.weight_class_id)
    .bind(request.equipment_m)
    .bind(request.equipment_sm)
    .bind(request.equipment_t)
    .bind(request.bodyweight)
    .bind(&request.lot_number)
    .bind(request.personal_record_at_entry)
    .bind(request.reshel_coefficient)
    .bind(request.mccullough_coefficient)
    .bind(request.rack_height_squat)
    .bind(request.rack_height_bench)
    .fetch_one(pool)
    .await?;

    Ok(Registration {
        id: row.try_get("id")?,
        contest_id: row.try_get("contest_id")?,
        competitor_id: row.try_get("competitor_id")?,
        age_category_id: row.try_get("age_category_id")?,
        weight_class_id: row.try_get("weight_class_id")?,
        equipment_m: row.try_get("equipment_m")?,
        equipment_sm: row.try_get("equipment_sm")?,
        equipment_t: row.try_get("equipment_t")?,
        bodyweight: row.try_get("bodyweight")?,
        lot_number: row.try_get("lot_number")?,
        personal_record_at_entry: row.try_get("personal_record_at_entry")?,
        reshel_coefficient: row.try_get("reshel_coefficient")?,
        mccullough_coefficient: row.try_get("mccullough_coefficient")?,
        rack_height_squat: row.try_get("rack_height_squat")?,
        rack_height_bench: row.try_get("rack_height_bench")?,
        created_at: row.try_get("created_at")?,
    })
}

/// Get registration by ID
pub async fn get_registration_by_id(
    pool: &Pool<Sqlite>,
    registration_id: &str,
) -> Result<Registration, sqlx::Error> {
    let row = sqlx::query(
        r#"
        SELECT id, contest_id, competitor_id, age_category_id, weight_class_id,
               equipment_m, equipment_sm, equipment_t, bodyweight, lot_number,
               personal_record_at_entry, reshel_coefficient, mccullough_coefficient,
               rack_height_squat, rack_height_bench, created_at
        FROM registrations WHERE id = ?1
        "#,
    )
    .bind(registration_id)
    .fetch_one(pool)
    .await?;

    Ok(Registration {
        id: row.try_get("id")?,
        contest_id: row.try_get("contest_id")?,
        competitor_id: row.try_get("competitor_id")?,
        age_category_id: row.try_get("age_category_id")?,
        weight_class_id: row.try_get("weight_class_id")?,
        equipment_m: row.try_get("equipment_m")?,
        equipment_sm: row.try_get("equipment_sm")?,
        equipment_t: row.try_get("equipment_t")?,
        bodyweight: row.try_get("bodyweight")?,
        lot_number: row.try_get("lot_number")?,
        personal_record_at_entry: row.try_get("personal_record_at_entry")?,
        reshel_coefficient: row.try_get("reshel_coefficient")?,
        mccullough_coefficient: row.try_get("mccullough_coefficient")?,
        rack_height_squat: row.try_get("rack_height_squat")?,
        rack_height_bench: row.try_get("rack_height_bench")?,
        created_at: row.try_get("created_at")?,
    })
}

/// Get all registrations for a contest
pub async fn get_registrations_by_contest(
    pool: &Pool<Sqlite>,
    contest_id: &str,
) -> Result<Vec<Registration>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT r.id, r.contest_id, r.competitor_id, r.age_category_id, r.weight_class_id,
               r.equipment_m, r.equipment_sm, r.equipment_t, r.bodyweight, r.lot_number,
               r.personal_record_at_entry, r.reshel_coefficient, r.mccullough_coefficient,
               r.rack_height_squat, r.rack_height_bench, r.created_at
        FROM registrations r
        WHERE r.contest_id = ?1
        ORDER BY r.lot_number, r.bodyweight
        "#,
    )
    .bind(contest_id)
    .fetch_all(pool)
    .await?;

    let mut registrations = Vec::new();
    for row in rows {
        registrations.push(Registration {
            id: row.try_get("id")?,
            contest_id: row.try_get("contest_id")?,
            competitor_id: row.try_get("competitor_id")?,
            age_category_id: row.try_get("age_category_id")?,
            weight_class_id: row.try_get("weight_class_id")?,
            equipment_m: row.try_get("equipment_m")?,
            equipment_sm: row.try_get("equipment_sm")?,
            equipment_t: row.try_get("equipment_t")?,
            bodyweight: row.try_get("bodyweight")?,
            lot_number: row.try_get("lot_number")?,
            personal_record_at_entry: row.try_get("personal_record_at_entry")?,
            reshel_coefficient: row.try_get("reshel_coefficient")?,
            mccullough_coefficient: row.try_get("mccullough_coefficient")?,
            rack_height_squat: row.try_get("rack_height_squat")?,
            rack_height_bench: row.try_get("rack_height_bench")?,
            created_at: row.try_get("created_at")?,
        });
    }

    Ok(registrations)
}

/// Update registration
pub async fn update_registration(
    pool: &Pool<Sqlite>,
    registration_id: &str,
    request: CreateRegistrationRequest,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        UPDATE registrations 
        SET age_category_id = ?1, weight_class_id = ?2, equipment_m = ?3, equipment_sm = ?4,
            equipment_t = ?5, bodyweight = ?6, lot_number = ?7, personal_record_at_entry = ?8,
            reshel_coefficient = ?9, mccullough_coefficient = ?10, rack_height_squat = ?11,
            rack_height_bench = ?12
        WHERE id = ?13
        "#,
    )
    .bind(&request.age_category_id)
    .bind(&request.weight_class_id)
    .bind(request.equipment_m)
    .bind(request.equipment_sm)
    .bind(request.equipment_t)
    .bind(request.bodyweight)
    .bind(&request.lot_number)
    .bind(request.personal_record_at_entry)
    .bind(request.reshel_coefficient)
    .bind(request.mccullough_coefficient)
    .bind(request.rack_height_squat)
    .bind(request.rack_height_bench)
    .bind(registration_id)
    .execute(pool)
    .await?;

    Ok(())
}

/// Get registration by competitor and contest
pub async fn get_registration_by_competitor_and_contest(
    pool: &Pool<Sqlite>,
    competitor_id: &str,
    contest_id: &str,
) -> Result<Option<Registration>, sqlx::Error> {
    let row = sqlx::query(
        r#"
        SELECT id, contest_id, competitor_id, age_category_id, weight_class_id,
               equipment_m, equipment_sm, equipment_t, bodyweight, lot_number,
               personal_record_at_entry, reshel_coefficient, mccullough_coefficient,
               rack_height_squat, rack_height_bench, created_at
        FROM registrations WHERE competitor_id = ?1 AND contest_id = ?2
        "#,
    )
    .bind(competitor_id)
    .bind(contest_id)
    .fetch_optional(pool)
    .await?;

    match row {
        Some(row) => Ok(Some(Registration {
            id: row.try_get("id")?,
            contest_id: row.try_get("contest_id")?,
            competitor_id: row.try_get("competitor_id")?,
            age_category_id: row.try_get("age_category_id")?,
            weight_class_id: row.try_get("weight_class_id")?,
            equipment_m: row.try_get("equipment_m")?,
            equipment_sm: row.try_get("equipment_sm")?,
            equipment_t: row.try_get("equipment_t")?,
            bodyweight: row.try_get("bodyweight")?,
            lot_number: row.try_get("lot_number")?,
            personal_record_at_entry: row.try_get("personal_record_at_entry")?,
            reshel_coefficient: row.try_get("reshel_coefficient")?,
            mccullough_coefficient: row.try_get("mccullough_coefficient")?,
            rack_height_squat: row.try_get("rack_height_squat")?,
            rack_height_bench: row.try_get("rack_height_bench")?,
            created_at: row.try_get("created_at")?,
        })),
        None => Ok(None),
    }
}

/// Delete registration
pub async fn delete_registration(
    pool: &Pool<Sqlite>,
    registration_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM registrations WHERE id = ?1")
        .bind(registration_id)
        .execute(pool)
        .await?;

    Ok(())
}
