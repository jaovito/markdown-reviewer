pub mod check_tools;
pub mod recents;
pub mod validate_repository;

use std::sync::Arc;

use crate::ports::{Clock, GhClient, GitClient, RecentsStore};

/// Container that bundles every port needed by this use-case family.
/// The IPC layer builds one of these at boot and clones the `Arc`s into handlers.
#[derive(Clone)]
pub struct RepoSelection {
    pub git: Arc<dyn GitClient>,
    pub gh: Arc<dyn GhClient>,
    pub recents: Arc<dyn RecentsStore>,
    pub clock: Arc<dyn Clock>,
}
