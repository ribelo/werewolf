pub mod contests;
pub mod competitors;
pub mod registrations;
pub mod attempts;
pub mod results;
pub mod windows;
pub mod system;

// Re-export all commands for easy registration
pub use contests::*;
pub use competitors::*;
pub use registrations::*;
pub use attempts::*;
pub use results::*;
pub use windows::*;
pub use system::*;