use std::path::Path;

use tracing_appender::non_blocking::WorkerGuard;
use tracing_appender::rolling::{RollingFileAppender, Rotation};
use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

/// Initializes tracing with a rolling file appender and a console layer.
/// Returns the `WorkerGuard` — keep it alive for the lifetime of the process.
pub fn init(logs_dir: &Path) -> WorkerGuard {
    let file_appender = RollingFileAppender::new(Rotation::DAILY, logs_dir, "markdown-reviewer.log");
    let (non_blocking, guard) = tracing_appender::non_blocking(file_appender);

    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info,markdown_reviewer=debug"));

    let file_layer = fmt::layer().with_ansi(false).with_writer(non_blocking);
    let console_layer = fmt::layer().with_target(false);

    let _ = tracing_subscriber::registry()
        .with(filter)
        .with(file_layer)
        .with(console_layer)
        .try_init();

    guard
}
