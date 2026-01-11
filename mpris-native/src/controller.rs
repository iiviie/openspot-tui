use crate::error::MprisError;
use crate::types::{PlaybackState, RepeatMode, TrackInfo};
use futures::StreamExt;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{broadcast, RwLock};
use tracing::{error, info, instrument, warn};
use zbus::zvariant::{Array, ObjectPath, OwnedValue, Str};
use zbus::{names::BusName, proxy, Connection};

#[proxy(
    interface = "org.mpris.MediaPlayer2.Player",
    default_path = "/org/mpris/MediaPlayer2"
)]
trait Player {
    fn play(&self) -> zbus::Result<()>;
    fn pause(&self) -> zbus::Result<()>;
    fn play_pause(&self) -> zbus::Result<()>;
    fn next(&self) -> zbus::Result<()>;
    fn previous(&self) -> zbus::Result<()>;
    fn seek(&self, offset: i64) -> zbus::Result<()>;
    fn set_position(&self, track_id: &ObjectPath<'_>, position: i64) -> zbus::Result<()>;

    #[zbus(property)]
    fn playback_status(&self) -> zbus::Result<String>;

    #[zbus(property)]
    fn metadata(&self) -> zbus::Result<HashMap<String, OwnedValue>>;

    #[zbus(property)]
    fn volume(&self) -> zbus::Result<f64>;

    #[zbus(property)]
    fn set_volume(&self, volume: f64) -> zbus::Result<()>;

    #[zbus(property)]
    fn shuffle(&self) -> zbus::Result<bool>;

    #[zbus(property)]
    fn set_shuffle(&self, shuffle: bool) -> zbus::Result<()>;

    #[zbus(property)]
    fn loop_status(&self) -> zbus::Result<String>;

    #[zbus(property)]
    fn set_loop_status(&self, status: &str) -> zbus::Result<()>;

    #[zbus(property)]
    fn position(&self) -> zbus::Result<i64>;
}

pub struct ControllerInner {
    connection: RwLock<Option<Connection>>,
    player: RwLock<Option<PlayerProxy<'static>>>,
    state: Arc<RwLock<PlaybackState>>,
    state_tx: broadcast::Sender<PlaybackState>,
}

impl ControllerInner {
    pub async fn new() -> Result<Self, MprisError> {
        let (state_tx, _) = broadcast::channel(16);

        Ok(Self {
            connection: RwLock::new(None),
            player: RwLock::new(None),
            state: Arc::new(RwLock::new(PlaybackState::default())),
            state_tx,
        })
    }

    #[instrument(skip(self))]
    pub async fn connect(&self) -> Result<(), MprisError> {
        self.connect_with_retry(3, 1000).await
    }

    /// Connect with retry logic to handle spotifyd startup delays
    async fn connect_with_retry(&self, max_retries: u32, initial_delay_ms: u64) -> Result<(), MprisError> {
        let mut last_error = None;

        for attempt in 0..max_retries {
            if attempt > 0 {
                let delay = initial_delay_ms * 2_u64.pow(attempt - 1);
                info!("Retry attempt {} after {}ms delay", attempt + 1, delay);
                tokio::time::sleep(Duration::from_millis(delay)).await;
            }

            match self.try_connect().await {
                Ok(()) => return Ok(()),
                Err(e) => {
                    warn!("Connection attempt {} failed: {}", attempt + 1, e);
                    last_error = Some(e);
                }
            }
        }

        Err(last_error.unwrap_or(MprisError::NotConnected))
    }

    /// Single connection attempt without retry
    async fn try_connect(&self) -> Result<(), MprisError> {
        info!("Connecting to MPRIS D-Bus interface");

        let conn = Connection::session().await?;
        info!("D-Bus session connection established");

        // Find spotifyd service
        let service_name = self.discover_player(&conn).await?;
        info!("Found player service: {}", service_name);

        let player = PlayerProxy::builder(&conn)
            .destination(service_name)?
            .build()
            .await?;

        // Store connection
        *self.connection.write().await = Some(conn.clone());
        *self.player.write().await = Some(player.clone());

        // Fetch initial state
        self.refresh_state().await?;

        // Subscribe to property changes
        self.start_signal_listener(player).await;

        info!("MPRIS connection established successfully");
        Ok(())
    }

    async fn discover_player(&self, conn: &Connection) -> Result<BusName<'static>, MprisError> {
        let dbus = zbus::fdo::DBusProxy::new(conn).await?;
        let names = dbus.list_names().await?;

        // Only look for spotifyd - do NOT fall back to other players
        for name in names.iter() {
            let name_str = name.as_str();
            if name_str.starts_with("org.mpris.MediaPlayer2.spotifyd")
                || name_str.starts_with("org.mpris.MediaPlayer2.spotify")
            {
                info!("Found Spotify/spotifyd player: {}", name_str);
                return Ok(name.to_owned().into());
            }
        }

        error!("spotifyd/spotify not found in MPRIS players. Available: {:?}",
            names.iter()
                .filter(|n| n.as_str().starts_with("org.mpris.MediaPlayer2."))
                .collect::<Vec<_>>()
        );
        Err(MprisError::PlayerNotFound)
    }

    #[instrument(skip(self))]
    pub async fn play_pause(&self) -> Result<bool, MprisError> {
        let player = self.player.read().await;
        let player = player.as_ref().ok_or(MprisError::NotConnected)?;

        player.play_pause().await?;

        // Wait a moment for the state to change
        tokio::time::sleep(Duration::from_millis(50)).await;

        let status = player.playback_status().await?;
        let is_playing = status == "Playing";

        // Update local state
        {
            let mut state = self.state.write().await;
            state.is_playing = is_playing;
            let _ = self.state_tx.send(state.clone());
        }

        info!("Play/pause toggled, now playing: {}", is_playing);
        Ok(is_playing)
    }

    #[instrument(skip(self))]
    pub async fn next(&self) -> Result<(), MprisError> {
        let player = self.player.read().await;
        let player = player.as_ref().ok_or(MprisError::NotConnected)?;
        player.next().await?;
        info!("Skipped to next track");
        Ok(())
    }

    #[instrument(skip(self))]
    pub async fn previous(&self) -> Result<(), MprisError> {
        let player = self.player.read().await;
        let player = player.as_ref().ok_or(MprisError::NotConnected)?;
        player.previous().await?;
        info!("Skipped to previous track");
        Ok(())
    }

    #[instrument(skip(self), fields(offset_ms = offset_ms))]
    pub async fn seek(&self, offset_ms: i64) -> Result<(), MprisError> {
        let player = self.player.read().await;
        let player = player.as_ref().ok_or(MprisError::NotConnected)?;
        // MPRIS seek offset is in microseconds
        player.seek(offset_ms * 1000).await?;
        info!("Seeked by {} ms", offset_ms);
        Ok(())
    }

    #[instrument(skip(self), fields(volume = volume))]
    pub async fn set_volume(&self, volume: f64) -> Result<(), MprisError> {
        let player = self.player.read().await;
        let player = player.as_ref().ok_or(MprisError::NotConnected)?;
        player.set_volume(volume).await?;

        // Update local state
        {
            let mut state = self.state.write().await;
            state.volume = volume;
            let _ = self.state_tx.send(state.clone());
        }

        info!("Volume set to {:.2}", volume);
        Ok(())
    }

    #[instrument(skip(self), fields(shuffle = shuffle))]
    pub async fn set_shuffle(&self, shuffle: bool) -> Result<(), MprisError> {
        let player = self.player.read().await;
        let player = player.as_ref().ok_or(MprisError::NotConnected)?;
        player.set_shuffle(shuffle).await?;

        // Update local state
        {
            let mut state = self.state.write().await;
            state.shuffle = shuffle;
            let _ = self.state_tx.send(state.clone());
        }

        info!("Shuffle set to {}", shuffle);
        Ok(())
    }

    #[instrument(skip(self), fields(repeat = ?repeat))]
    pub async fn set_repeat(&self, repeat: RepeatMode) -> Result<(), MprisError> {
        let player = self.player.read().await;
        let player = player.as_ref().ok_or(MprisError::NotConnected)?;

        let status = match repeat {
            RepeatMode::None => "None",
            RepeatMode::Playlist => "Playlist",
            RepeatMode::Track => "Track",
        };

        player.set_loop_status(status).await?;

        // Update local state
        {
            let mut state = self.state.write().await;
            state.repeat = repeat;
            let _ = self.state_tx.send(state.clone());
        }

        info!("Repeat set to {:?}", status);
        Ok(())
    }

    #[instrument(skip(self))]
    pub async fn refresh_state(&self) -> Result<(), MprisError> {
        let player = self.player.read().await;
        let player = player.as_ref().ok_or(MprisError::NotConnected)?;

        let status = player.playback_status().await.unwrap_or_default();
        let metadata = player.metadata().await.unwrap_or_default();
        let volume = player.volume().await.unwrap_or(1.0);
        let shuffle = player.shuffle().await.unwrap_or(false);
        let loop_status = player.loop_status().await.unwrap_or_default();
        let position = player.position().await.unwrap_or(0);

        let is_playing = status == "Playing";
        let repeat = match loop_status.as_str() {
            "Playlist" => RepeatMode::Playlist,
            "Track" => RepeatMode::Track,
            _ => RepeatMode::None,
        };

        let track = self.parse_metadata(&metadata);
        let duration_ms = self
            .extract_duration(&metadata)
            .unwrap_or(0);

        let new_state = PlaybackState {
            is_playing,
            position_ms: position / 1000, // Convert from microseconds
            duration_ms: duration_ms / 1000,
            volume,
            shuffle,
            repeat,
            track,
        };

        *self.state.write().await = new_state.clone();
        let _ = self.state_tx.send(new_state);

        Ok(())
    }

    fn parse_metadata(&self, metadata: &HashMap<String, OwnedValue>) -> Option<TrackInfo> {
        let title = metadata
            .get("xesam:title")
            .and_then(|v| v.downcast_ref::<Str>().ok())
            .map(|s| s.to_string())?;

        let artist = metadata
            .get("xesam:artist")
            .and_then(|v| v.downcast_ref::<Array>().ok())
            .and_then(|arr| {
                arr.iter()
                    .next()
                    .and_then(|item| item.downcast_ref::<Str>().ok())
                    .map(|s| s.to_string())
            })
            .unwrap_or_default();

        let album = metadata
            .get("xesam:album")
            .and_then(|v| v.downcast_ref::<Str>().ok())
            .map(|s| s.to_string())
            .unwrap_or_default();

        let art_url = metadata
            .get("mpris:artUrl")
            .and_then(|v| v.downcast_ref::<Str>().ok())
            .map(|s| s.to_string());

        let uri = metadata
            .get("mpris:trackid")
            .and_then(|v| v.downcast_ref::<ObjectPath>().ok())
            .map(|p| p.to_string())
            .unwrap_or_default();

        Some(TrackInfo {
            title,
            artist,
            album,
            art_url,
            uri,
        })
    }

    fn extract_duration(&self, metadata: &HashMap<String, OwnedValue>) -> Option<i64> {
        metadata
            .get("mpris:length")
            .and_then(|v| v.downcast_ref::<i64>().ok())
            .map(|val| val.clone())
    }

    async fn start_signal_listener(&self, player: PlayerProxy<'static>) {
        info!("Starting PropertiesChanged signal listener");

        let state = self.state.clone();
        let state_tx = self.state_tx.clone();
        let player_clone1 = player.clone();

        tokio::spawn(async move {
            // Get a stream of PropertiesChanged signals
            let mut property_stream = player_clone1.receive_playback_status_changed().await;

            info!("Property change listener active");

            // Listen for property changes
            while let Some(change) = property_stream.next().await {
                match change.get().await {
                    Ok(new_status) => {
                        info!("Playback status changed: {}", new_status);

                        // Update state
                        let mut current_state = state.write().await;
                        current_state.is_playing = new_status == "Playing";
                        let updated_state = current_state.clone();
                        drop(current_state);

                        // Broadcast update
                        let _ = state_tx.send(updated_state);
                    }
                    Err(e) => {
                        warn!("Error getting property change: {}", e);
                    }
                }
            }

            warn!("Property change listener stopped");
        });

        // Also listen for metadata changes
        let state = self.state.clone();
        let state_tx = self.state_tx.clone();
        let player_clone = player.clone();

        tokio::spawn(async move {
            let mut metadata_stream = player_clone.receive_metadata_changed().await;

            info!("Metadata change listener active");

            while let Some(change) = metadata_stream.next().await {
                match change.get().await {
                    Ok(metadata) => {
                        info!("Metadata changed");

                        // Parse track info
                        let track_info = if !metadata.is_empty() {
                            Self::parse_metadata_static(&metadata)
                        } else {
                            None
                        };

                        let duration_ms = Self::extract_duration_static(&metadata)
                            .map(|d| d / 1000)
                            .unwrap_or(0);

                        // Update state
                        let mut current_state = state.write().await;
                        current_state.track = track_info;
                        current_state.duration_ms = duration_ms;
                        let updated_state = current_state.clone();
                        drop(current_state);

                        // Broadcast update
                        let _ = state_tx.send(updated_state);
                    }
                    Err(e) => {
                        warn!("Error getting metadata change: {}", e);
                    }
                }
            }

            warn!("Metadata change listener stopped");
        });
    }

    fn parse_metadata_static(metadata: &HashMap<String, OwnedValue>) -> Option<TrackInfo> {
        let title = metadata
            .get("xesam:title")
            .and_then(|v| v.downcast_ref::<Str>().ok())
            .map(|s| s.to_string())?;

        let artist = metadata
            .get("xesam:artist")
            .and_then(|v| v.downcast_ref::<Array>().ok())
            .and_then(|arr| {
                arr.iter()
                    .next()
                    .and_then(|item| item.downcast_ref::<Str>().ok())
                    .map(|s| s.to_string())
            })
            .unwrap_or_default();

        let album = metadata
            .get("xesam:album")
            .and_then(|v| v.downcast_ref::<Str>().ok())
            .map(|s| s.to_string())
            .unwrap_or_default();

        let art_url = metadata
            .get("mpris:artUrl")
            .and_then(|v| v.downcast_ref::<Str>().ok())
            .map(|s| s.to_string());

        let uri = metadata
            .get("mpris:trackid")
            .and_then(|v| v.downcast_ref::<ObjectPath>().ok())
            .map(|p| p.to_string())
            .unwrap_or_default();

        Some(TrackInfo {
            title,
            artist,
            album,
            art_url,
            uri,
        })
    }

    fn extract_duration_static(metadata: &HashMap<String, OwnedValue>) -> Option<i64> {
        metadata
            .get("mpris:length")
            .and_then(|v| v.downcast_ref::<i64>().ok())
            .map(|val| val.clone())
    }

    pub fn get_state(&self) -> PlaybackState {
        // Synchronous read for immediate UI access
        self.state.blocking_read().clone()
    }

    pub fn subscribe_state_changes(&self) -> broadcast::Receiver<PlaybackState> {
        self.state_tx.subscribe()
    }
}
