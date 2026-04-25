pub mod changed_files;
pub mod file_diff;
pub mod list;
pub mod load;

use std::sync::Arc;

use crate::ports::{GhClient, GitClient};

/// Bundles ports needed by the pull-requests use cases.
#[derive(Clone)]
pub struct PullRequests {
    pub gh: Arc<dyn GhClient>,
    pub git: Arc<dyn GitClient>,
}
