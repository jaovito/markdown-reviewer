pub mod crud;
pub mod submit;

use std::sync::Arc;

use crate::ports::{Clock, CommentsStore, GhClient};

/// Bundles the ports needed by every comment use case.
///
/// `gh` lives here so #19's `submit_review` use case can publish drafts;
/// the local CRUD operations only touch `store` and `clock`.
#[derive(Clone)]
pub struct Comments {
    pub store: Arc<dyn CommentsStore>,
    pub clock: Arc<dyn Clock>,
    pub gh: Arc<dyn GhClient>,
}
