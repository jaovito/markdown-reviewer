pub mod read_markdown_file;

use std::sync::Arc;

use crate::ports::{GhClient, GitClient};

/// Bundles ports needed to read repository file contents at a given ref.
#[derive(Clone)]
pub struct Files {
    pub git: Arc<dyn GitClient>,
    pub gh: Arc<dyn GhClient>,
}
