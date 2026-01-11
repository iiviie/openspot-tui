use thiserror::Error;

#[derive(Debug, Error)]
pub enum MprisError {
    #[error("D-Bus connection failed: {0}")]
    ConnectionFailed(#[from] zbus::Error),

    #[error("D-Bus FDO error: {0}")]
    FdoError(#[from] zbus::fdo::Error),

    #[error("Player not found")]
    PlayerNotFound,

    #[error("Command timeout after {0:?}")]
    Timeout(std::time::Duration),

    #[error("spotifyd not running")]
    SpotifydNotRunning,

    #[error("Not connected to MPRIS")]
    NotConnected,

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Failed to parse metadata: {0}")]
    MetadataParse(String),

    #[error("Process spawn failed: {0}")]
    ProcessSpawn(String),

    #[error("D-Bus registration timeout")]
    RegistrationTimeout,
}

impl From<MprisError> for napi::Error {
    fn from(err: MprisError) -> Self {
        napi::Error::from_reason(err.to_string())
    }
}
