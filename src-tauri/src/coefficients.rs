use chrono::{NaiveDate, Utc};

/// Calculate Reshel coefficient based on bodyweight and gender
/// This is a simplified formula - in practice you'd use official IPF tables
pub fn calculate_reshel_coefficient(bodyweight: f64, gender: &str) -> f64 {
    // Simplified Wilks/IPF GL coefficient calculation
    // These are approximate coefficients for demonstration
    match gender.to_lowercase().as_str() {
        "male" | "m" => {
            let a = -216.0475144;
            let b = 16.2606339;
            let c = -0.002388645;
            let d = -0.00113732;
            let e = 7.01863e-06;
            let f = -1.291e-08;

            let x = bodyweight;
            500.0
                / (a + b * x
                    + c * x * x
                    + d * x * x * x
                    + e * x * x * x * x
                    + f * x * x * x * x * x)
        }
        "female" | "f" => {
            let a = 594.31747775582;
            let b = -27.23842536447;
            let c = 0.82112226871;
            let d = -0.00930733913;
            let e = 4.731582e-05;
            let f = -9.054e-08;

            let x = bodyweight;
            500.0
                / (a + b * x
                    + c * x * x
                    + d * x * x * x
                    + e * x * x * x * x
                    + f * x * x * x * x * x)
        }
        _ => 1.0, // Default
    }
}

/// Calculate McCullough coefficient based on age
/// Age adjustment factor for masters/veterans and juniors
pub fn calculate_mccullough_coefficient(birth_date: &str, contest_date: &str) -> f64 {
    // Parse dates
    let birth = match NaiveDate::parse_from_str(birth_date, "%Y-%m-%d") {
        Ok(date) => date,
        Err(_) => return 1.0, // Default if parsing fails
    };

    let contest = match NaiveDate::parse_from_str(contest_date, "%Y-%m-%d") {
        Ok(date) => date,
        Err(_) => Utc::now().date_naive(), // Use today if parsing fails
    };

    // Calculate age on contest date
    let age = contest.years_since(birth).unwrap_or(0);

    // McCullough age factors (simplified)
    match age {
        // Juniors (under 24)
        13..=15 => 1.13, // Junior 13
        16..=18 => 1.08, // Junior 16
        19 => 1.06,      // Junior 19
        20..=23 => 1.03, // Junior 23

        // Senior (24-39) - no adjustment
        24..=39 => 1.0,

        // Masters/Veterans (40+)
        40..=44 => 1.01, // Veteran 40
        45..=49 => 1.02,
        50..=54 => 1.04, // Veteran 50
        55..=59 => 1.06,
        60..=64 => 1.09, // Veteran 60
        65..=69 => 1.12,
        70..=74 => 1.16, // Veteran 70
        75..=79 => 1.21,
        80.. => 1.27, // Veteran 80+

        _ => 1.0, // Default
    }
}

/// Determine age category based on age
pub fn determine_age_category(birth_date: &str, contest_date: &str) -> String {
    let birth = match NaiveDate::parse_from_str(birth_date, "%Y-%m-%d") {
        Ok(date) => date,
        Err(_) => return "SENIOR".to_string(),
    };

    let contest = match NaiveDate::parse_from_str(contest_date, "%Y-%m-%d") {
        Ok(date) => date,
        Err(_) => Utc::now().date_naive(),
    };

    let age = contest.years_since(birth).unwrap_or(0);

    match age {
        13..=15 => "JUNIOR13".to_string(),
        16..=18 => "JUNIOR16".to_string(),
        19 => "JUNIOR19".to_string(),
        20..=23 => "JUNIOR23".to_string(),
        24..=39 => "SENIOR".to_string(),
        40..=49 => "VETERAN40".to_string(),
        50..=59 => "VETERAN50".to_string(),
        60..=69 => "VETERAN60".to_string(),
        70.. => "VETERAN70".to_string(),
        _ => "SENIOR".to_string(),
    }
}

/// Determine weight class based on bodyweight and gender
pub fn determine_weight_class(bodyweight: f64, gender: &str) -> String {
    match gender.to_lowercase().as_str() {
        "male" | "m" => {
            if bodyweight <= 52.0 {
                "M_52".to_string()
            } else if bodyweight <= 56.0 {
                "M_56".to_string()
            } else if bodyweight <= 60.0 {
                "M_60".to_string()
            } else if bodyweight <= 67.5 {
                "M_67_5".to_string()
            } else if bodyweight <= 75.0 {
                "M_75".to_string()
            } else if bodyweight <= 82.5 {
                "M_82_5".to_string()
            } else if bodyweight <= 90.0 {
                "M_90".to_string()
            } else if bodyweight <= 100.0 {
                "M_100".to_string()
            } else if bodyweight <= 110.0 {
                "M_110".to_string()
            } else if bodyweight <= 125.0 {
                "M_125".to_string()
            } else if bodyweight <= 140.0 {
                "M_140".to_string()
            } else {
                "M_140_PLUS".to_string()
            }
        }
        "female" | "f" => {
            if bodyweight <= 47.0 {
                "F_47".to_string()
            } else if bodyweight <= 52.0 {
                "F_52".to_string()
            } else if bodyweight <= 57.0 {
                "F_57".to_string()
            } else if bodyweight <= 63.0 {
                "F_63".to_string()
            } else if bodyweight <= 72.0 {
                "F_72".to_string()
            } else if bodyweight <= 84.0 {
                "F_84".to_string()
            } else {
                "F_84_PLUS".to_string()
            }
        }
        _ => "M_75".to_string(), // Default
    }
}

/// Calculate total points for a lifter
pub fn calculate_points(total_weight: f64, reshel: f64, mccullough: f64) -> f64 {
    if total_weight <= 0.0 {
        0.0
    } else {
        total_weight * reshel * mccullough
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_reshel_calculation() {
        // Test male coefficient
        let coeff = calculate_reshel_coefficient(82.5, "male");
        assert!(coeff > 0.6 && coeff < 0.8); // Reasonable range for 82.5kg male

        // Test female coefficient
        let coeff = calculate_reshel_coefficient(63.0, "female");
        assert!(coeff > 0.9 && coeff < 1.2); // Reasonable range for 63kg female
    }

    #[test]
    fn test_age_category() {
        let category = determine_age_category("1998-05-15", "2025-09-01");
        assert_eq!(category, "SENIOR"); // 27 years old

        let category = determine_age_category("2006-03-20", "2025-09-01");
        assert_eq!(category, "JUNIOR19"); // 19 years old
    }

    #[test]
    fn test_weight_class() {
        let class = determine_weight_class(82.5, "male");
        assert_eq!(class, "M_82_5");

        let class = determine_weight_class(63.0, "female");
        assert_eq!(class, "F_63");
    }

    #[test]
    fn test_points_calculation() {
        let points = calculate_points(200.0, 0.7, 1.0);
        assert_eq!(points, 140.0);

        let points = calculate_points(0.0, 0.7, 1.0);
        assert_eq!(points, 0.0);
    }
}
