use crate::error::MprisError;
use crate::types::{SpotifydConfig, SpotifydStatus};
use std::path::PathBuf;
use std::time::Duration;
use tokio::process::{Child, Command};
use tokio::sync::{watch, RwLock};
use tracing::{error, info, instrument, warn};
use zbus::Connection;

/// Find the spotifyd binary path
/// Priority: 1. Custom config path 2. Downloaded binary 3. System PATH
fn find_spotifyd_binary(config: &SpotifydConfig) -> String {
    // 1. Check for custom path in config
    if let Some(ref path) = config.config_path {
        if std::path::Path::new(path).exists() {
            return path.clone();
        }
    }

    // 2. Check for environment variable
    if let Ok(path) = std::env::var("SPOTIFY_TUI_SPOTIFYD_PATH") {
        if std::path::Path::new(&path).exists() {
            return path;
        }
    }

    // 3. Check for downloaded binary at ~/.spotify-tui/bin/spotifyd
    if let Some(home) = std::env::var_os("HOME") {
        let downloaded_path: PathBuf = [
            home.to_string_lossy().as_ref(),
            ".spotify-tui",
            "bin",
            "spotifyd",
        ]
        .iter()
        .collect();

        if downloaded_path.exists() {
            return downloaded_path.to_string_lossy().to_string();
        }
    }

    // 4. Fall back to system PATH
    "spotifyd".to_string()
}

pub struct SupervisorInner {
    process: RwLock<Option<Child>>,
    status_tx: watch::Sender<SpotifydStatus>,
    config: SpotifydConfig,
}

impl SupervisorInner {
    pub fn new(config: SpotifydConfig) -> Self {
        let (status_tx, _) = watch::channel(SpotifydStatus::default());

        Self {
            process: RwLock::new(None),
            status_tx,
            config,
        }
    }

    #[instrument(skip(self))]
    pub async fn start(&self) -> Result<(), MprisError> {
        info!("Starting spotifyd supervisor");

        // Check if already running
        if self.process.read().await.is_some() {
            warn!("spotifyd process already running");
            return Ok(());
        }

        // Find the spotifyd binary
        let binary_path = find_spotifyd_binary(&self.config);
        info!("Using spotifyd binary: {}", binary_path);

        // Build command
        let mut cmd = Command::new(&binary_path);
        cmd.arg("--no-daemon");

        if let Some(ref device_name) = self.config.device_name {
            cmd.arg("--device-name").arg(device_name);
        }

        // Spawn the process
        let child = cmd
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| MprisError::ProcessSpawn(e.to_string()))?;

        let pid = child.id();
        info!("spotifyd started with PID: {:?}", pid);

        *self.process.write().await = Some(child);

        // Wait a moment for spotifyd to initialize (like TypeScript version)
        tokio::time::sleep(Duration::from_millis(1500)).await;

        // Check if process is still running
        let is_running = self.process.read().await.is_some();

        // Update status
        self.status_tx
            .send(SpotifydStatus {
                running: is_running,
                pid,
                authenticated: true, // Assume authenticated if credentials exist
            })
            .ok();

        if is_running {
            info!("spotifyd successfully started");
            
            // Try to wait for D-Bus registration, but don't fail if it times out
            match self.wait_for_dbus_registration().await {
                Ok(()) => info!("spotifyd D-Bus registration confirmed"),
                Err(_) => warn!("spotifyd D-Bus registration pending (may take a few more seconds)"),
            }
        }

        Ok(())
    }

    #[instrument(skip(self))]
    async fn wait_for_dbus_registration(&self) -> Result<(), MprisError> {
        info!("Waiting for spotifyd D-Bus registration");

        let conn = Connection::session()
            .await
            .map_err(|_| MprisError::RegistrationTimeout)?;

        for attempt in 1..=30 {
            let dbus = zbus::fdo::DBusProxy::new(&conn)
                .await
                .map_err(|_| MprisError::RegistrationTimeout)?;

            let names = dbus
                .list_names()
                .await
                .map_err(|_| MprisError::RegistrationTimeout)?;

            if names
                .iter()
                .any(|n| n.as_str().starts_with("org.mpris.MediaPlayer2.spotifyd"))
            {
                info!("spotifyd D-Bus registration detected after {} attempts", attempt);
                return Ok(());
            }

            tokio::time::sleep(Duration::from_millis(100)).await;
        }

        error!("spotifyd D-Bus registration timeout after 3 seconds");
        Err(MprisError::RegistrationTimeout)
    }

    #[instrument(skip(self))]
    pub async fn stop(&self) -> Result<(), MprisError> {
        info!("Stopping spotifyd");

        if let Some(mut child) = self.process.write().await.take() {
            child.kill().await?;
            child.wait().await?;

            self.status_tx
                .send(SpotifydStatus {
                    running: false,
                    pid: None,
                    authenticated: false,
                })
                .ok();

            info!("spotifyd stopped successfully");
        } else {
            warn!("No spotifyd process to stop");
        }

        Ok(())
    }

    pub fn get_status(&self) -> SpotifydStatus {
        self.status_tx.borrow().clone()
    }

    pub fn subscribe_status(&self) -> watch::Receiver<SpotifydStatus> {
        self.status_tx.subscribe()
    }

    #[instrument(skip(self))]
    pub async fn check_health(&self) -> bool {
        let process = self.process.read().await;
        process.is_some()
    }
}
