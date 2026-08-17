pub mod read_markdown_file;
pub mod read_repo_asset;

pub use read_repo_asset::{read_repo_asset, MAX_ASSET_BYTES};

use std::sync::Arc;

use crate::ports::{GhClient, GitClient};

/// Bundles ports needed to read repository file contents at a given ref.
#[derive(Clone)]
pub struct Files {
    pub git: Arc<dyn GitClient>,
    pub gh: Arc<dyn GhClient>,
}
