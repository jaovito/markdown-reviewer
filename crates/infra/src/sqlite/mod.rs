pub mod connection;
pub mod recents_store;

pub use connection::{open_and_migrate, Db};
pub use recents_store::SqliteRecentsStore;
