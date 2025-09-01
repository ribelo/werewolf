pub mod attempts;
pub mod competitors;
pub mod contests;
pub mod registrations;
pub mod results;
pub mod settings;
pub mod system;
pub mod windows;
pub mod contest_state;

// Re-export all commands for easy registration
pub use attempts::*;
pub use competitors::*;
pub use contest_state::*;
pub use contests::*;
pub use registrations::*;
pub use results::*;
pub use settings::*;
pub use system::*;
pub use windows::*;
