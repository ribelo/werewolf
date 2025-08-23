pub mod contests;
pub mod competitors;
pub mod registrations;
pub mod attempts;
pub mod categories;
pub mod results;

// Re-export all query modules
pub use contests::*;
pub use competitors::*;
pub use registrations::*;
pub use attempts::*;
pub use categories::*;
pub use results::*;