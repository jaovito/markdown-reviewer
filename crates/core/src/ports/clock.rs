use time::OffsetDateTime;

pub trait Clock: Send + Sync {
    fn now(&self) -> OffsetDateTime;

    fn now_unix_ms(&self) -> i64 {
        i64::try_from(self.now().unix_timestamp_nanos() / 1_000_000).unwrap_or(i64::MAX)
    }
}
