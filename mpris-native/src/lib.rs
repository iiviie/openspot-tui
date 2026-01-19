mod controller;
mod error;
mod supervisor;
mod types;

use controller::ControllerInner;
use error::MprisError;
use napi::bindgen_prelude::*;
use napi::threadsafe_function::{ErrorStrategy, ThreadsafeFunction, ThreadsafeFunctionCallMode};
use napi::JsFunction;
use napi_derive::napi;
use once_cell::sync::Lazy;
use std::sync::Arc;
use supervisor::SupervisorInner;
use tokio::runtime::Runtime;
use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};
use tracing_appender::rolling::{RollingFileAppender, Rotation};
use types::{PlaybackState, RepeatMode, SpotifydConfig, SpotifydStartResult, SpotifydStatus};

// Re-export types for TypeScript
pub use types::{ConnectionStatus, TrackInfo};

// Single shared tokio runtime
static RUNTIME: Lazy<Runtime> = Lazy::new(|| {
    tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .build()
        .expect("Failed to create Tokio runtime")
});

// Initialize tracing - logs to file instead of stdout to avoid cluttering TUI
static INIT_TRACING: Lazy<()> = Lazy::new(|| {
    // Create log directory
    let log_dir = std::env::var("HOME")
        .map(|home| std::path::PathBuf::from(home).join(".spotify-tui").join("logs"))
        .unwrap_or_else(|_| std::path::PathBuf::from("/tmp/spotify-tui-logs"));

    let _ = std::fs::create_dir_all(&log_dir);

    // Create rolling file appender (rotates daily, keeps 5 files)
    let file_appender = RollingFileAppender::builder()
        .rotation(Rotation::DAILY) // Rotate daily
        .filename_prefix("mpris-native") // File prefix
        .filename_suffix("log") // File extension
        .max_log_files(5) // Keep max 5 files
        .build(&log_dir)
        .expect("Failed to create log appender");

    // Use non_blocking writer for better performance
    let (non_blocking, _guard) = tracing_appender::non_blocking(file_appender);

    // Build subscriber with file writer
    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info"));

    tracing_subscriber::registry()
        .with(env_filter)
        .with(fmt::layer().with_writer(non_blocking))
        .init();

    // Intentionally leak _guard to keep the logger alive for the lifetime of the program
    std::mem::forget(_guard);
});

#[napi]
pub struct MprisController {
    inner: Arc<ControllerInner>,
}

#[napi]
impl MprisController {
    #[napi(constructor)]
    pub fn new() -> Result<Self> {
        Lazy::force(&INIT_TRACING);

        let inner = RUNTIME.block_on(async { ControllerInner::new().await })?;

        Ok(Self {
            inner: Arc::new(inner),
        })
    }

    /// Connect to MPRIS D-Bus interface
    #[napi]
    pub async fn connect(&self) -> Result<()> {
        let inner = self.inner.clone();
        RUNTIME
            .spawn(async move { inner.connect().await })
            .await
            .map_err(|e| Error::from_reason(e.to_string()))??;
        Ok(())
    }

    /// Play or pause playback. Returns new playing state.
    #[napi]
    pub async fn play_pause(&self) -> Result<bool> {
        let inner = self.inner.clone();
        let result = RUNTIME
            .spawn(async move { inner.play_pause().await })
            .await
            .map_err(|e| Error::from_reason(e.to_string()))??;
        Ok(result)
    }

    /// Skip to next track
    #[napi]
    pub async fn next(&self) -> Result<()> {
        let inner = self.inner.clone();
        RUNTIME
            .spawn(async move { inner.next().await })
            .await
            .map_err(|e| Error::from_reason(e.to_string()))??;
        Ok(())
    }

    /// Skip to previous track
    #[napi]
    pub async fn previous(&self) -> Result<()> {
        let inner = self.inner.clone();
        RUNTIME
            .spawn(async move { inner.previous().await })
            .await
            .map_err(|e| Error::from_reason(e.to_string()))??;
        Ok(())
    }

    /// Seek by offset in milliseconds
    #[napi]
    pub async fn seek(&self, offset_ms: i64) -> Result<()> {
        let inner = self.inner.clone();
        RUNTIME
            .spawn(async move { inner.seek(offset_ms).await })
            .await
            .map_err(|e| Error::from_reason(e.to_string()))??;
        Ok(())
    }

    /// Set volume (0.0 - 1.0)
    #[napi]
    pub async fn set_volume(&self, volume: f64) -> Result<()> {
        let inner = self.inner.clone();
        RUNTIME
            .spawn(async move { inner.set_volume(volume).await })
            .await
            .map_err(|e| Error::from_reason(e.to_string()))??;
        Ok(())
    }

    /// Set shuffle mode
    #[napi]
    pub async fn set_shuffle(&self, shuffle: bool) -> Result<()> {
        let inner = self.inner.clone();
        RUNTIME
            .spawn(async move { inner.set_shuffle(shuffle).await })
            .await
            .map_err(|e| Error::from_reason(e.to_string()))??;
        Ok(())
    }

    /// Set repeat mode
    #[napi]
    pub async fn set_repeat(&self, repeat: RepeatMode) -> Result<()> {
        let inner = self.inner.clone();
        RUNTIME
            .spawn(async move { inner.set_repeat(repeat).await })
            .await
            .map_err(|e| Error::from_reason(e.to_string()))??;
        Ok(())
    }

    /// Get current playback state (synchronous)
    #[napi]
    pub fn get_state(&self) -> PlaybackState {
        self.inner.get_state()
    }

    /// Refresh state from MPRIS (async - fetches fresh data from D-Bus)
    #[napi]
    pub async fn refresh_state(&self) -> Result<()> {
        let inner = self.inner.clone();
        RUNTIME
            .spawn(async move { inner.refresh_state().await })
            .await
            .map_err(|e| Error::from_reason(e.to_string()))??;
        Ok(())
    }

    /// Subscribe to state changes. Callback invoked on state updates.
    #[napi(ts_args_type = "callback: (state: PlaybackState) => void")]
    pub fn on_state_change(&self, callback: JsFunction) -> Result<()> {
        let tsfn: ThreadsafeFunction<PlaybackState, ErrorStrategy::Fatal> = callback
            .create_threadsafe_function(0, |ctx| Ok(vec![ctx.value]))?;

        let inner = self.inner.clone();
        RUNTIME.spawn(async move {
            let mut rx = inner.subscribe_state_changes();
            while let Ok(state) = rx.recv().await {
                tsfn.call(state, ThreadsafeFunctionCallMode::NonBlocking);
            }
        });

        Ok(())
    }
}

#[napi]
pub struct SpotifydSupervisor {
    inner: Arc<SupervisorInner>,
}

#[napi]
impl SpotifydSupervisor {
    #[napi(constructor)]
    pub fn new(config: Option<SpotifydConfig>) -> Self {
        Lazy::force(&INIT_TRACING);

        Self {
            inner: Arc::new(SupervisorInner::new(config.unwrap_or_default())),
        }
    }

    /// Start spotifyd or adopt an existing instance
    /// This is the primary method to use - handles both cases
    #[napi]
    pub async fn start_or_adopt(&self) -> Result<SpotifydStartResult> {
        let inner = self.inner.clone();
        let result = RUNTIME
            .spawn(async move { inner.start_or_adopt().await })
            .await
            .map_err(|e| Error::from_reason(e.to_string()))??;
        Ok(result)
    }

    /// Legacy start method (calls start_or_adopt internally)
    #[napi]
    pub async fn start(&self) -> Result<()> {
        let inner = self.inner.clone();
        RUNTIME
            .spawn(async move { inner.start().await })
            .await
            .map_err(|e| Error::from_reason(e.to_string()))??;
        Ok(())
    }

    /// Stop spotifyd gracefully
    /// @param force - If true, kill any spotifyd process. If false, only kill if we spawned it.
    #[napi]
    pub async fn stop(&self, force: Option<bool>) -> Result<()> {
        let inner = self.inner.clone();
        let force = force.unwrap_or(false);
        RUNTIME
            .spawn(async move { inner.stop(force).await })
            .await
            .map_err(|e| Error::from_reason(e.to_string()))??;
        Ok(())
    }

    /// Get current spotifyd status (synchronous)
    #[napi]
    pub fn get_status(&self) -> SpotifydStatus {
        self.inner.get_status()
    }

    /// Check if spotifyd is running (process alive)
    #[napi]
    pub async fn is_running(&self) -> Result<bool> {
        let inner = self.inner.clone();
        let alive = RUNTIME
            .spawn(async move { inner.is_alive().await })
            .await
            .map_err(|e| Error::from_reason(e.to_string()))?;
        Ok(alive)
    }

    /// Check if spotifyd is healthy (running AND D-Bus responsive)
    #[napi]
    pub async fn is_healthy(&self) -> Result<bool> {
        let inner = self.inner.clone();
        let healthy = RUNTIME
            .spawn(async move { inner.is_healthy().await })
            .await
            .map_err(|e| Error::from_reason(e.to_string()))?;
        Ok(healthy)
    }

    /// Get the PID of the tracked spotifyd process (if any)
    #[napi]
    pub async fn get_pid(&self) -> Result<Option<u32>> {
        let inner = self.inner.clone();
        let pid = RUNTIME
            .spawn(async move { inner.get_tracked_pid().await })
            .await
            .map_err(|e| Error::from_reason(e.to_string()))?;
        Ok(pid)
    }

    /// Subscribe to status changes
    #[napi(ts_args_type = "callback: (status: SpotifydStatus) => void")]
    pub fn on_status_change(&self, callback: JsFunction) -> Result<()> {
        let tsfn: ThreadsafeFunction<SpotifydStatus, ErrorStrategy::Fatal> = callback
            .create_threadsafe_function(0, |ctx| Ok(vec![ctx.value]))?;

        let inner = self.inner.clone();
        RUNTIME.spawn(async move {
            let mut rx = inner.subscribe_status();
            while rx.changed().await.is_ok() {
                let status = rx.borrow().clone();
                tsfn.call(status, ThreadsafeFunctionCallMode::NonBlocking);
            }
        });

        Ok(())
    }

    /// Legacy check_health method (alias for is_healthy)
    #[napi]
    pub async fn check_health(&self) -> Result<bool> {
        self.is_healthy().await
    }
}
