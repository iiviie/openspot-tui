use crate::error::MprisError;
use crate::types::{SpotifydConfig, SpotifydStartResult, SpotifydStatus};
use std::os::unix::process::CommandExt;
use std::path::PathBuf;
use std::process::Stdio;
use std::time::Duration;
use tokio::sync::{watch, RwLock};
use tracing::{debug, error, info, instrument, warn};
use zbus::Connection;

/// Find the spotifyd binary path
/// Priority: 1. Custom config path 2. Environment variable 3. Downloaded binary 4. System PATH
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

/// Check if a process with given PID is alive (not a zombie)
fn is_pid_alive(pid: u32) -> bool {
    let stat_path = format!("/proc/{}/stat", pid);
    if let Ok(contents) = std::fs::read_to_string(&stat_path) {
        // /proc/[pid]/stat format: pid (comm) state ...
        // State 'Z' means zombie
        if let Some(state_start) = contents.rfind(')') {
            if let Some(state_char) = contents.get(state_start + 2..state_start + 3) {
                return state_char != "Z";
            }
        }
        // If we can read the file but can't parse state, assume alive
        true
    } else {
        false
    }
}

/// Kill a process by PID using SIGTERM, then SIGKILL if needed
async fn kill_pid(pid: u32) -> bool {
    info!("Killing spotifyd process with PID {}", pid);

    // Try SIGTERM first
    unsafe {
        if libc::kill(pid as i32, libc::SIGTERM) == 0 {
            // Wait up to 2 seconds for graceful shutdown
            for _ in 0..20 {
                tokio::time::sleep(Duration::from_millis(100)).await;
                if !is_pid_alive(pid) {
                    info!("spotifyd {} terminated gracefully", pid);
                    return true;
                }
            }

            // Force kill with SIGKILL
            warn!("spotifyd {} didn't terminate, sending SIGKILL", pid);
            if libc::kill(pid as i32, libc::SIGKILL) == 0 {
                tokio::time::sleep(Duration::from_millis(100)).await;
                return !is_pid_alive(pid);
            }
        }
    }
    false
}

/// Find ALL spotifyd PIDs via pgrep
async fn find_all_spotifyd_pids() -> Vec<u32> {
    let output = tokio::process::Command::new("pgrep")
        .arg("-x")
        .arg("spotifyd")
        .output()
        .await;

    match output {
        Ok(out) if out.status.success() => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            stdout
                .lines()
                .filter_map(|line| line.trim().parse::<u32>().ok())
                .collect()
        }
        _ => Vec::new(),
    }
}

/// Kill ALL existing spotifyd processes
async fn kill_all_spotifyd() -> usize {
    let pids = find_all_spotifyd_pids().await;
    let count = pids.len();
    
    if count > 0 {
        info!("Killing {} existing spotifyd process(es)", count);
        for pid in pids {
            kill_pid(pid).await;
        }
        // Wait a bit for all processes to fully terminate
        tokio::time::sleep(Duration::from_millis(300)).await;
    }
    
    count
}

pub struct SupervisorInner {
    /// Child process handle (only if we spawned it)
    spawned_child_pid: RwLock<Option<u32>>,
    /// Adopted process PID (existing process we didn't spawn)
    adopted_pid: RwLock<Option<u32>>,
    /// Status broadcast channel
    status_tx: watch::Sender<SpotifydStatus>,
    /// Configuration
    config: SpotifydConfig,
    /// Lock to prevent concurrent start_or_adopt calls
    start_lock: tokio::sync::Mutex<()>,
}

impl SupervisorInner {
    pub fn new(config: SpotifydConfig) -> Self {
        let (status_tx, _) = watch::channel(SpotifydStatus::default());

        Self {
            spawned_child_pid: RwLock::new(None),
            adopted_pid: RwLock::new(None),
            status_tx,
            config,
            start_lock: tokio::sync::Mutex::new(()),
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Process Discovery
    // ─────────────────────────────────────────────────────────────

    /// Find existing spotifyd process via D-Bus registration
    #[instrument(skip(self))]
    pub async fn find_spotifyd_via_dbus(&self) -> Option<u32> {
        debug!("Looking for spotifyd via D-Bus");

        let conn = match Connection::session().await {
            Ok(c) => c,
            Err(e) => {
                warn!("Failed to connect to D-Bus session: {}", e);
                return None;
            }
        };

        let dbus = match zbus::fdo::DBusProxy::new(&conn).await {
            Ok(d) => d,
            Err(e) => {
                warn!("Failed to create DBus proxy: {}", e);
                return None;
            }
        };

        let names = match dbus.list_names().await {
            Ok(n) => n,
            Err(e) => {
                warn!("Failed to list D-Bus names: {}", e);
                return None;
            }
        };

        // Find spotifyd service
        for name in names.iter() {
            if name.as_str().starts_with("org.mpris.MediaPlayer2.spotifyd") {
                debug!("Found spotifyd D-Bus service: {}", name);

                // Get the PID of the service owner
                match dbus.get_connection_unix_process_id(name.clone().into()).await {
                    Ok(pid) => {
                        info!("Found spotifyd via D-Bus with PID {}", pid);
                        return Some(pid);
                    }
                    Err(e) => {
                        warn!("Could not get PID for {}: {}", name, e);
                    }
                }
            }
        }

        None
    }

    /// Find existing spotifyd process via pgrep (fallback)
    #[instrument(skip(self))]
    pub async fn find_spotifyd_via_pgrep(&self) -> Option<u32> {
        debug!("Looking for spotifyd via pgrep");

        let output = tokio::process::Command::new("pgrep")
            .arg("-x")
            .arg("spotifyd")
            .output()
            .await;

        match output {
            Ok(out) if out.status.success() => {
                let stdout = String::from_utf8_lossy(&out.stdout);
                // Take the first PID if multiple found
                if let Some(pid_str) = stdout.lines().next() {
                    if let Ok(pid) = pid_str.trim().parse::<u32>() {
                        info!("Found spotifyd via pgrep with PID {}", pid);
                        return Some(pid);
                    }
                }
                None
            }
            _ => None,
        }
    }

    /// Find any existing spotifyd process
    pub async fn find_existing_spotifyd(&self) -> Option<u32> {
        // Prefer D-Bus as it confirms the process is responsive
        if let Some(pid) = self.find_spotifyd_via_dbus().await {
            return Some(pid);
        }

        // Fall back to pgrep
        self.find_spotifyd_via_pgrep().await
    }

    // ─────────────────────────────────────────────────────────────
    // Health Checks
    // ─────────────────────────────────────────────────────────────

    /// Check if D-Bus interface is responsive (can make calls)
    #[instrument(skip(self))]
    pub async fn check_dbus_responsive(&self) -> bool {
        debug!("Checking if spotifyd D-Bus interface is responsive");

        let conn = match Connection::session().await {
            Ok(c) => c,
            Err(_) => return false,
        };

        let dbus = match zbus::fdo::DBusProxy::new(&conn).await {
            Ok(d) => d,
            Err(_) => return false,
        };

        let names = match dbus.list_names().await {
            Ok(n) => n,
            Err(_) => return false,
        };

        let has_spotifyd = names
            .iter()
            .any(|n| n.as_str().starts_with("org.mpris.MediaPlayer2.spotifyd"));

        if has_spotifyd {
            debug!("spotifyd D-Bus interface is responsive");
        }

        has_spotifyd
    }

    /// Get the current tracked PID (spawned or adopted)
    pub async fn get_tracked_pid(&self) -> Option<u32> {
        if let Some(pid) = *self.spawned_child_pid.read().await {
            return Some(pid);
        }
        *self.adopted_pid.read().await
    }

    /// Check if tracked spotifyd is still alive
    #[instrument(skip(self))]
    pub async fn is_alive(&self) -> bool {
        if let Some(pid) = self.get_tracked_pid().await {
            let alive = is_pid_alive(pid);
            debug!("spotifyd PID {} alive: {}", pid, alive);
            return alive;
        }
        false
    }

    /// Full health check: process alive AND D-Bus responsive
    pub async fn is_healthy(&self) -> bool {
        self.is_alive().await && self.check_dbus_responsive().await
    }

    // ─────────────────────────────────────────────────────────────
    // Process Management
    // ─────────────────────────────────────────────────────────────

    /// Adopt an existing spotifyd process
    #[instrument(skip(self))]
    pub async fn adopt(&self, pid: u32) -> Result<(), MprisError> {
        info!("Adopting existing spotifyd process with PID {}", pid);

        // Clear any previous state
        *self.spawned_child_pid.write().await = None;
        *self.adopted_pid.write().await = Some(pid);

        // Update status
        self.status_tx
            .send(SpotifydStatus {
                running: true,
                pid: Some(pid),
                authenticated: true,
            })
            .ok();

        Ok(())
    }

    /// Start a fresh spotifyd process (truly detached, survives parent death)
    #[instrument(skip(self))]
    pub async fn start_fresh(&self) -> Result<u32, MprisError> {
        info!("Starting fresh spotifyd process");

        // Find the spotifyd binary
        let binary_path = find_spotifyd_binary(&self.config);
        info!("Using spotifyd binary: {}", binary_path);

        // Check if binary exists
        if !std::path::Path::new(&binary_path).exists() && binary_path != "spotifyd" {
            return Err(MprisError::ProcessSpawn(format!(
                "spotifyd binary not found at {}",
                binary_path
            )));
        }

        // Build the command arguments
        let mut args = vec!["--no-daemon".to_string()];

        if let Some(ref device_name) = self.config.device_name {
            args.push("--device-name".to_string());
            args.push(device_name.clone());
        }

        let binary_path_clone = binary_path.clone();
        let args_clone = args.clone();

        // Spawn in a blocking task using double-fork to properly daemonize
        // This prevents zombie processes by making init (PID 1) the parent
        let child_pid = tokio::task::spawn_blocking(move || {
            // First fork
            let pid = unsafe { libc::fork() };
            
            if pid < 0 {
                return Err(MprisError::ProcessSpawn("Fork failed".to_string()));
            }
            
            if pid > 0 {
                // Parent process - wait for first child to exit immediately
                let mut status: libc::c_int = 0;
                unsafe { libc::waitpid(pid, &mut status, 0) };
                
                // Read the grandchild PID from the status
                // The first child will have written it to a temp file
                let pid_file = format!("/tmp/spotifyd-{}.pid", pid);
                let grandchild_pid = std::fs::read_to_string(&pid_file)
                    .ok()
                    .and_then(|s| s.trim().parse::<u32>().ok());
                let _ = std::fs::remove_file(&pid_file);
                
                return grandchild_pid.ok_or_else(|| MprisError::ProcessSpawn("Failed to get grandchild PID".to_string()));
            }
            
            // First child - will exit immediately after forking grandchild
            // Create new session
            unsafe { libc::setsid() };
            
            // Second fork
            let pid2 = unsafe { libc::fork() };
            
            if pid2 < 0 {
                std::process::exit(1);
            }
            
            if pid2 > 0 {
                // First child - write grandchild PID and exit
                let pid_file = format!("/tmp/spotifyd-{}.pid", std::process::id());
                let _ = std::fs::write(&pid_file, format!("{}", pid2));
                std::process::exit(0);
            }
            
            // Grandchild - this becomes the actual spotifyd process
            // Close all file descriptors and redirect to /dev/null
            unsafe {
                // Redirect stdin, stdout, stderr to /dev/null
                let dev_null = libc::open(b"/dev/null\0".as_ptr() as *const i8, libc::O_RDWR);
                if dev_null >= 0 {
                    libc::dup2(dev_null, libc::STDIN_FILENO);
                    libc::dup2(dev_null, libc::STDOUT_FILENO);
                    libc::dup2(dev_null, libc::STDERR_FILENO);
                    if dev_null > libc::STDERR_FILENO {
                        libc::close(dev_null);
                    }
                }
            }
            
            // Convert args to CStrings
            let c_binary = std::ffi::CString::new(binary_path_clone.as_str()).unwrap();
            let c_args: Vec<std::ffi::CString> = std::iter::once(c_binary.clone())
                .chain(args_clone.iter().map(|s| std::ffi::CString::new(s.as_str()).unwrap()))
                .collect();
            let c_argv: Vec<*const i8> = c_args.iter()
                .map(|s| s.as_ptr())
                .chain(std::iter::once(std::ptr::null()))
                .collect();
            
            // Exec spotifyd
            unsafe {
                libc::execvp(c_binary.as_ptr(), c_argv.as_ptr());
                // If exec returns, it failed
                libc::_exit(1);
            }
        })
        .await
        .map_err(|e| MprisError::ProcessSpawn(format!("Task join error: {}", e)))??;

        info!("spotifyd spawned with PID {}", child_pid);

        // Store the PID
        *self.spawned_child_pid.write().await = Some(child_pid);
        *self.adopted_pid.write().await = None;

        // Wait for spotifyd to initialize
        tokio::time::sleep(Duration::from_millis(1500)).await;

        // Verify it's still running
        if !is_pid_alive(child_pid) {
            *self.spawned_child_pid.write().await = None;
            return Err(MprisError::ProcessSpawn(
                "spotifyd exited immediately after starting".to_string(),
            ));
        }

        // Update status
        self.status_tx
            .send(SpotifydStatus {
                running: true,
                pid: Some(child_pid),
                authenticated: true,
            })
            .ok();

        // Wait for D-Bus registration (non-blocking, just informational)
        match self.wait_for_dbus_registration().await {
            Ok(()) => info!("spotifyd D-Bus registration confirmed"),
            Err(_) => warn!("spotifyd D-Bus registration pending (may take a few more seconds)"),
        }

        Ok(child_pid)
    }

    /// Start spotifyd or adopt existing instance
    #[instrument(skip(self))]
    pub async fn start_or_adopt(&self) -> Result<SpotifydStartResult, MprisError> {
        // Acquire lock to prevent concurrent calls
        let _guard = self.start_lock.lock().await;
        
        info!("Starting or adopting spotifyd");

        // First, check if we already have a healthy tracked process
        if let Some(pid) = self.get_tracked_pid().await {
            if is_pid_alive(pid) && self.check_dbus_responsive().await {
                info!("Already tracking healthy spotifyd with PID {}", pid);
                return Ok(SpotifydStartResult {
                    success: true,
                    message: "Spotifyd already running".to_string(),
                    pid: Some(pid),
                    adopted: true,
                });
            }
            // Our tracked process is dead or unhealthy, clear it
            *self.spawned_child_pid.write().await = None;
            *self.adopted_pid.write().await = None;
        }

        // Check for existing spotifyd (not tracked by us)
        if let Some(pid) = self.find_existing_spotifyd().await {
            info!("Found existing spotifyd with PID {}", pid);

            // Verify it's actually healthy (responsive)
            if is_pid_alive(pid) && self.check_dbus_responsive().await {
                self.adopt(pid).await?;
                return Ok(SpotifydStartResult {
                    success: true,
                    message: "Adopted existing spotifyd instance (instant start!)".to_string(),
                    pid: Some(pid),
                    adopted: true,
                });
            }

            // Process exists but not healthy - kill ALL existing spotifyd processes
            warn!("Existing spotifyd {} is not healthy, killing all instances", pid);
        }

        // Kill ALL existing spotifyd processes before starting fresh
        // This ensures we don't accumulate zombie processes
        let killed = kill_all_spotifyd().await;
        if killed > 0 {
            info!("Killed {} existing spotifyd process(es)", killed);
        }
        
        // Double-check no spotifyd processes remain (paranoid verification)
        let remaining = find_all_spotifyd_pids().await;
        if !remaining.is_empty() {
            warn!("Spotifyd processes still running after kill: {:?}", remaining);
            // Try killing them again more aggressively
            for pid in remaining {
                kill_pid(pid).await;
            }
            tokio::time::sleep(Duration::from_millis(500)).await;
        }

        // Start fresh
        match self.start_fresh().await {
            Ok(pid) => Ok(SpotifydStartResult {
                success: true,
                message: "Started fresh spotifyd instance".to_string(),
                pid: Some(pid),
                adopted: false,
            }),
            Err(e) => Ok(SpotifydStartResult {
                success: false,
                message: format!("Failed to start spotifyd: {}", e),
                pid: None,
                adopted: false,
            }),
        }
    }

    /// Wait for spotifyd D-Bus registration
    #[instrument(skip(self))]
    async fn wait_for_dbus_registration(&self) -> Result<(), MprisError> {
        debug!("Waiting for spotifyd D-Bus registration");

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
                info!(
                    "spotifyd D-Bus registration detected after {} attempts",
                    attempt
                );
                return Ok(());
            }

            tokio::time::sleep(Duration::from_millis(100)).await;
        }

        error!("spotifyd D-Bus registration timeout after 3 seconds");
        Err(MprisError::RegistrationTimeout)
    }

    /// Stop spotifyd (whether spawned or adopted)
    #[instrument(skip(self))]
    pub async fn stop(&self, force: bool) -> Result<(), MprisError> {
        info!("Stopping spotifyd (force={})", force);

        let pid = self.get_tracked_pid().await;

        if let Some(pid) = pid {
            if force || self.spawned_child_pid.read().await.is_some() {
                kill_pid(pid).await;
            } else {
                info!("Not killing adopted process {} without force flag", pid);
            }
        } else if force {
            // Force mode: find and kill any spotifyd
            if let Some(pid) = self.find_existing_spotifyd().await {
                kill_pid(pid).await;
            }
        }

        // Clear state
        *self.spawned_child_pid.write().await = None;
        *self.adopted_pid.write().await = None;

        // Update status
        self.status_tx
            .send(SpotifydStatus {
                running: false,
                pid: None,
                authenticated: false,
            })
            .ok();

        info!("spotifyd stopped");
        Ok(())
    }

    /// Get current status
    pub fn get_status(&self) -> SpotifydStatus {
        self.status_tx.borrow().clone()
    }

    /// Subscribe to status changes
    pub fn subscribe_status(&self) -> watch::Receiver<SpotifydStatus> {
        self.status_tx.subscribe()
    }

    // ─────────────────────────────────────────────────────────────
    // Legacy compatibility
    // ─────────────────────────────────────────────────────────────

    /// Legacy start method (calls start_or_adopt internally)
    pub async fn start(&self) -> Result<(), MprisError> {
        self.start_or_adopt().await?;
        Ok(())
    }

    /// Legacy check_health method
    pub async fn check_health(&self) -> bool {
        self.is_healthy().await
    }
}
