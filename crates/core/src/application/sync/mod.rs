pub mod cache;
pub mod mapping;
pub mod mutations;
pub mod refresh;

use std::sync::Arc;

use crate::ports::{Clock, FileResolver, GhClient, RemoteThreadsStore};

/// Ports bundle for every sync use case. Cloned from `AppState`; every field
/// is `Arc<dyn …>` so cloning is cheap.
#[derive(Clone)]
pub struct Sync {
    pub gh: Arc<dyn GhClient>,
    pub store: Arc<dyn RemoteThreadsStore>,
    pub files: Arc<dyn FileResolver>,
    pub clock: Arc<dyn Clock>,
}
