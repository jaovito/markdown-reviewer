pub mod changed_files;
pub mod list;
pub mod load;

use std::sync::Arc;

use crate::ports::GhClient;

/// Bundles ports needed by the pull-requests use cases.
#[derive(Clone)]
pub struct PullRequests {
    pub gh: Arc<dyn GhClient>,
}
