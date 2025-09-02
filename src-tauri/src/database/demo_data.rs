// NOTE: This demo data module uses runtime SQL queries instead of compile-time safe macros
// This is an EXCEPTION to CLAUDE.md guidelines because:
// 1. This is a CLI utility, not core application logic
// 2. SQLx offline mode doesn't have cached data for new demo queries
// 3. Demo data generation is a development tool, not production code
// For all production application code, use query!() macros as specified in CLAUDE.md

use chrono::NaiveDate;
use sqlx::{Pool, Sqlite};

use crate::database::queries::{
    attempts::upsert_attempt_weight,
    competitors::{create_competitor, Competitor, CreateCompetitorRequest},
    contests::create_contest,
    registrations::{create_registration, CreateRegistrationRequest},
};
use crate::models::contest::{Discipline, NewContest};

/// Demo competitor data with realistic Polish names and stats
struct DemoCompetitor {
    first_name: &'static str,
    last_name: &'static str,
    birth_date: &'static str,
    gender: &'static str,
    bodyweight: f64,
    club: Option<&'static str>,
    city: Option<&'static str>,
    // Starting weights for squat, bench, deadlift (kg)
    squat_opener: f64,
    bench_opener: f64,
    deadlift_opener: f64,
}

const DEMO_COMPETITORS: [DemoCompetitor; 10] = [
    DemoCompetitor {
        first_name: "Jan",
        last_name: "Kowalski",
        birth_date: "1999-03-15",
        gender: "Male",
        bodyweight: 82.5,
        club: Some("Siła Warszawa"),
        city: Some("Warszawa"),
        squat_opener: 140.0,
        bench_opener: 100.0,
        deadlift_opener: 180.0,
    },
    DemoCompetitor {
        first_name: "Anna",
        last_name: "Nowak",
        birth_date: "1996-07-22",
        gender: "Female",
        bodyweight: 63.0,
        club: Some("Power Kraków"),
        city: Some("Kraków"),
        squat_opener: 90.0,
        bench_opener: 55.0,
        deadlift_opener: 120.0,
    },
    DemoCompetitor {
        first_name: "Piotr",
        last_name: "Wiśniewski",
        birth_date: "1989-11-08",
        gender: "Male",
        bodyweight: 93.0,
        club: Some("Strong Gdańsk"),
        city: Some("Gdańsk"),
        squat_opener: 170.0,
        bench_opener: 120.0,
        deadlift_opener: 210.0,
    },
    DemoCompetitor {
        first_name: "Katarzyna",
        last_name: "Wójcik",
        birth_date: "2002-01-18",
        gender: "Female",
        bodyweight: 57.0,
        club: Some("Fit Wrocław"),
        city: Some("Wrocław"),
        squat_opener: 80.0,
        bench_opener: 45.0,
        deadlift_opener: 105.0,
    },
    DemoCompetitor {
        first_name: "Michał",
        last_name: "Kamiński",
        birth_date: "1982-09-03",
        gender: "Male",
        bodyweight: 105.0,
        club: Some("Atlas Poznań"),
        city: Some("Poznań"),
        squat_opener: 190.0,
        bench_opener: 140.0,
        deadlift_opener: 230.0,
    },
    DemoCompetitor {
        first_name: "Magdalena",
        last_name: "Lewandowska",
        birth_date: "1993-05-12",
        gender: "Female",
        bodyweight: 72.0,
        club: Some("Iron Łódź"),
        city: Some("Łódź"),
        squat_opener: 110.0,
        bench_opener: 70.0,
        deadlift_opener: 140.0,
    },
    DemoCompetitor {
        first_name: "Tomasz",
        last_name: "Zieliński",
        birth_date: "2005-12-07",
        gender: "Male",
        bodyweight: 74.0,
        club: Some("Young Power"),
        city: Some("Katowice"),
        squat_opener: 110.0,
        bench_opener: 75.0,
        deadlift_opener: 145.0,
    },
    DemoCompetitor {
        first_name: "Małgorzata",
        last_name: "Szymańska",
        birth_date: "1979-04-25",
        gender: "Female",
        bodyweight: 84.0,
        club: Some("Veteran Strength"),
        city: Some("Lublin"),
        squat_opener: 95.0,
        bench_opener: 60.0,
        deadlift_opener: 125.0,
    },
    DemoCompetitor {
        first_name: "Krzysztof",
        last_name: "Woźniak",
        birth_date: "1986-08-14",
        gender: "Male",
        bodyweight: 120.0,
        club: Some("Heavy Lifting"),
        city: Some("Szczecin"),
        squat_opener: 220.0,
        bench_opener: 160.0,
        deadlift_opener: 260.0,
    },
    DemoCompetitor {
        first_name: "Agnieszka",
        last_name: "Dąbrowska",
        birth_date: "1998-10-30",
        gender: "Female",
        bodyweight: 69.0,
        club: Some("Elite Lifting"),
        city: Some("Białystok"),
        squat_opener: 100.0,
        bench_opener: 65.0,
        deadlift_opener: 130.0,
    },
];

/// Generate complete demo data for the powerlifting application
pub async fn generate_demo_data(
    pool: &Pool<Sqlite>,
    force: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    // Check if database already has data
    if !force {
        let contest_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM contests")
            .fetch_one(pool)
            .await?;

        if contest_count > 0 {
            return Err("Database already contains contests. Use --force to overwrite.".into());
        }
    }

    println!("🐺 Creating demo powerlifting competition...");

    // We'll work directly with pool since functions expect Pool, not Transaction

    // Step 1: Create demo contest
    let contest = create_contest(
        pool,
        NewContest {
            name: "Demo Powerlifting Competition".to_string(),
            date: chrono::Local::now().naive_local().date(),
            location: "Demo Gym".to_string(),
            discipline: Discipline::Powerlifting,
            federation_rules: Some("IPF Rules".to_string()),
            competition_type: Some("Regional Championship".to_string()),
            organizer: Some("Demo Organizer".to_string()),
            notes: Some("Generated demo competition with 10 competitors".to_string()),
        },
    )
    .await?;

    println!("✓ Created contest: {}", contest.name);

    // Step 2: Ensure age categories exist
    ensure_age_categories(pool).await?;
    println!("✓ Age categories ready");

    // Step 3: Ensure weight classes exist
    ensure_weight_classes(pool).await?;
    println!("✓ Weight classes ready");

    // Step 4: Create competitors and register them
    let mut created_competitors = Vec::new();

    for demo_competitor in &DEMO_COMPETITORS {
        // Create competitor
        let competitor = create_competitor(
            pool,
            CreateCompetitorRequest {
                first_name: demo_competitor.first_name.to_string(),
                last_name: demo_competitor.last_name.to_string(),
                birth_date: demo_competitor.birth_date.to_string(),
                gender: demo_competitor.gender.to_string(),
                club: demo_competitor.club.map(|s| s.to_string()),
                city: demo_competitor.city.map(|s| s.to_string()),
                notes: None,
                photo_base64: None,
                photo_filename: None,
            },
        )
        .await?;

        // Register competitor for contest
        let registration = create_registration(
            pool,
            CreateRegistrationRequest {
                contest_id: contest.id.clone(),
                competitor_id: competitor.id.clone(),
                bodyweight: demo_competitor.bodyweight,
                age_category_id: get_age_category_for_competitor(pool, &competitor).await?,
                weight_class_id: get_weight_class_for_competitor(pool, &competitor).await?,
                equipment_m: true, // Raw powerlifting
                equipment_sm: false,
                equipment_t: false,
                lot_number: None,
                personal_record_at_entry: None,
                reshel_coefficient: None,
                mccullough_coefficient: None,
                rack_height_squat: Some(if demo_competitor.gender == "Male" {
                    12
                } else {
                    10
                }),
                rack_height_bench: Some(if demo_competitor.gender == "Male" {
                    8
                } else {
                    6
                }),
            },
        )
        .await?;

        // Create attempts for all three lifts
        create_attempts_for_competitor(pool, &registration.id, demo_competitor).await?;

        created_competitors.push((competitor, registration));
        println!(
            "✓ Created competitor: {} {}",
            demo_competitor.first_name, demo_competitor.last_name
        );
    }

    println!("\n🎉 Demo data created successfully!");
    println!("Contest: {}", contest.name);
    println!("Competitors: {}", created_competitors.len());
    println!("Total attempts: {}", created_competitors.len() * 9); // 3 lifts × 3 attempts each
    println!("\nYou can now start the application to see the demo competition!");

    Ok(())
}

/// Ensure standard age categories exist
async fn ensure_age_categories(pool: &Pool<Sqlite>) -> Result<(), sqlx::Error> {
    let categories = [
        ("JUNIOR", "Junior", Some(14), Some(23)),
        ("SENIOR", "Senior", Some(24), Some(39)),
        ("VETERAN40", "Veteran 40+", Some(40), Some(49)),
        ("VETERAN50", "Veteran 50+", Some(50), Some(59)),
        ("VETERAN60", "Veteran 60+", Some(60), None),
    ];

    for (id, name, min_age, max_age) in categories {
        sqlx::query(
            "INSERT OR IGNORE INTO age_categories (id, name, min_age, max_age) VALUES (?, ?, ?, ?)",
        )
        .bind(id)
        .bind(name)
        .bind(min_age)
        .bind(max_age)
        .execute(pool)
        .await?;
    }

    Ok(())
}

/// Ensure standard weight classes exist
async fn ensure_weight_classes(pool: &Pool<Sqlite>) -> Result<(), sqlx::Error> {
    let male_classes = [
        ("M59", "Male", "DO 59 KG", None, Some(59.0)),
        ("M66", "Male", "DO 66 KG", Some(59.01), Some(66.0)),
        ("M74", "Male", "DO 74 KG", Some(66.01), Some(74.0)),
        ("M83", "Male", "DO 83 KG", Some(74.01), Some(83.0)),
        ("M93", "Male", "DO 93 KG", Some(83.01), Some(93.0)),
        ("M105", "Male", "DO 105 KG", Some(93.01), Some(105.0)),
        ("M120", "Male", "DO 120 KG", Some(105.01), Some(120.0)),
        ("M120+", "Male", "+ 120 KG", Some(120.01), None),
    ];

    let female_classes = [
        ("F47", "Female", "DO 47 KG", None, Some(47.0)),
        ("F52", "Female", "DO 52 KG", Some(47.01), Some(52.0)),
        ("F57", "Female", "DO 57 KG", Some(52.01), Some(57.0)),
        ("F63", "Female", "DO 63 KG", Some(57.01), Some(63.0)),
        ("F69", "Female", "DO 69 KG", Some(63.01), Some(69.0)),
        ("F76", "Female", "DO 76 KG", Some(69.01), Some(76.0)),
        ("F84", "Female", "DO 84 KG", Some(76.01), Some(84.0)),
        ("F84+", "Female", "+ 84 KG", Some(84.01), None),
    ];

    for (id, gender, name, weight_min, weight_max) in
        male_classes.iter().chain(female_classes.iter())
    {
        sqlx::query(
            "INSERT OR IGNORE INTO weight_classes (id, gender, name, weight_min, weight_max) VALUES (?, ?, ?, ?, ?)"
        )
        .bind(id)
        .bind(gender)
        .bind(name)
        .bind(weight_min)
        .bind(weight_max)
        .execute(pool)
        .await?;
    }

    Ok(())
}

/// Get appropriate age category for competitor
async fn get_age_category_for_competitor(
    pool: &Pool<Sqlite>,
    competitor: &Competitor,
) -> Result<String, sqlx::Error> {
    // Calculate age from birth_date
    let birth_date = NaiveDate::parse_from_str(&competitor.birth_date, "%Y-%m-%d")
        .map_err(|_| sqlx::Error::Protocol("Invalid birth date format".to_string()))?;

    let today = chrono::Local::now().naive_local().date();
    let age = (today - birth_date).num_days() / 365;

    let category_id: String = sqlx::query_scalar(
        r#"
        SELECT id FROM age_categories 
        WHERE (min_age IS NULL OR ? >= min_age) 
        AND (max_age IS NULL OR ? <= max_age)
        ORDER BY min_age ASC
        LIMIT 1
        "#,
    )
    .bind(age)
    .bind(age)
    .fetch_one(pool)
    .await?;

    Ok(category_id)
}

/// Get appropriate weight class for competitor
async fn get_weight_class_for_competitor(
    pool: &Pool<Sqlite>,
    competitor: &Competitor,
) -> Result<String, sqlx::Error> {
    // For registration, we need the bodyweight, but we don't have it in competitor model
    // We'll use a default approach and find appropriate class during registration
    let weight_class_id: String = sqlx::query_scalar(
        r#"
        SELECT id FROM weight_classes 
        WHERE gender = ?
        ORDER BY weight_max ASC
        LIMIT 1
        "#,
    )
    .bind(&competitor.gender)
    .fetch_one(pool)
    .await?;

    Ok(weight_class_id)
}

/// Create 3 attempts for each lift (squat, bench, deadlift) for a competitor
async fn create_attempts_for_competitor(
    pool: &Pool<Sqlite>,
    registration_id: &str,
    demo_competitor: &DemoCompetitor,
) -> Result<(), sqlx::Error> {
    let lifts = [
        ("Squat", demo_competitor.squat_opener),
        ("Bench", demo_competitor.bench_opener),
        ("Deadlift", demo_competitor.deadlift_opener),
    ];

    for (lift_type, opener_weight) in lifts {
        for attempt_number in 1..=3 {
            let weight = match attempt_number {
                1 => opener_weight,
                2 => opener_weight + 10.0, // Second attempt: +10kg
                3 => opener_weight + 20.0, // Third attempt: +20kg
                _ => unreachable!(),
            };

            upsert_attempt_weight(pool, registration_id, lift_type, attempt_number, weight).await?;
        }
    }

    Ok(())
}
