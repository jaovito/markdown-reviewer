use std::path::{Path, PathBuf};

use markdown_reviewer_core::{AppError, AppResult};

#[derive(Debug, Clone)]
pub struct Paths {
    pub data_dir: PathBuf,
    pub logs_dir: PathBuf,
    pub db_path: PathBuf,
}

impl Paths {
    pub fn from_data_dir<P: AsRef<Path>>(data_dir: P) -> AppResult<Self> {
        let data_dir = data_dir.as_ref().to_path_buf();
        let logs_dir = data_dir.join("logs");
        let db_path = data_dir.join("markdown-reviewer.sqlite");
        std::fs::create_dir_all(&data_dir).map_err(AppError::io)?;
        std::fs::create_dir_all(&logs_dir).map_err(AppError::io)?;
        Ok(Self { data_dir, logs_dir, db_path })
    }
}
