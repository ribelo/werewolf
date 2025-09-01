pub mod attempts;
pub mod categories;
pub mod competitors;
pub mod contest_states;
pub mod contests;
pub mod registrations;
pub mod results;

#[cfg(test)]
mod tests;

// Re-export all query modules
pub use attempts::*;
pub use categories::*;
pub use competitors::*;
pub use contests::*;
pub use registrations::*;
pub use results::*;
