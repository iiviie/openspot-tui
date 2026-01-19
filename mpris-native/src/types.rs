use napi_derive::napi;

#[napi(object)]
#[derive(Clone, Default, Debug)]
pub struct PlaybackState {
    pub is_playing: bool,
    pub position_ms: i64,
    pub duration_ms: i64,
    pub volume: f64,
    pub shuffle: bool,
    pub repeat: RepeatMode,
    pub track: Option<TrackInfo>,
}

#[napi(string_enum)]
#[derive(Default, Debug)]
pub enum RepeatMode {
    #[default]
    None,
    Playlist,
    Track,
}

#[napi(object)]
#[derive(Clone, Debug)]
pub struct TrackInfo {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub art_url: Option<String>,
    pub uri: String,
}

#[napi(object)]
#[derive(Clone, Debug)]
pub struct ConnectionStatus {
    pub mpris_connected: bool,
    pub spotifyd_running: bool,
    pub spotifyd_authenticated: bool,
    pub error: Option<String>,
}

#[napi(object)]
#[derive(Clone, Debug, Default)]
pub struct SpotifydStatus {
    pub running: bool,
    pub pid: Option<u32>,
    pub authenticated: bool,
}

/// Result of starting or adopting spotifyd
#[napi(object)]
#[derive(Clone, Debug)]
pub struct SpotifydStartResult {
    pub success: bool,
    pub message: String,
    pub pid: Option<u32>,
    /// True if we adopted an existing process, false if we spawned a new one
    pub adopted: bool,
}

#[napi(object)]
#[derive(Clone, Debug)]
pub struct SpotifydConfig {
    pub config_path: Option<String>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub device_name: Option<String>,
}

impl Default for SpotifydConfig {
    fn default() -> Self {
        Self {
            config_path: None,
            username: None,
            password: None,
            device_name: Some("spotify-tui".to_string()),
        }
    }
}
