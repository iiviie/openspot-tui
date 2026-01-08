/**
 * MPRIS Service
 * Controls spotifyd via D-Bus MPRIS interface
 */

import dbus from "dbus-next";
import type {
  PlaybackStatus,
  LoopStatus,
  MprisMetadata,
  MprisPlayerState,
  NowPlayingInfo,
} from "../types/mpris";

const MPRIS_PREFIX = "org.mpris.MediaPlayer2";
const MPRIS_PATH = "/org/mpris/MediaPlayer2";
const PLAYER_INTERFACE = "org.mpris.MediaPlayer2.Player";
const PROPERTIES_INTERFACE = "org.freedesktop.DBus.Properties";

/**
 * Service for controlling Spotify via MPRIS D-Bus interface
 */
export class MprisService {
  private bus: dbus.MessageBus | null = null;
  private playerInterface: dbus.ClientInterface | null = null;
  private propertiesInterface: dbus.ClientInterface | null = null;
  private serviceName: string | null = null;
  private connected: boolean = false;

  /**
   * Connect to the spotifyd MPRIS interface
   */
  async connect(): Promise<boolean> {
    try {
      // Get the session bus
      this.bus = dbus.sessionBus();

      // Find spotifyd's MPRIS service name
      this.serviceName = await this.findSpotifydService();
      if (!this.serviceName) {
        console.error("spotifyd MPRIS service not found. Is spotifyd running?");
        return false;
      }

      // Get the proxy object
      const proxyObject = await this.bus.getProxyObject(
        this.serviceName,
        MPRIS_PATH
      );

      // Get interfaces
      this.playerInterface = proxyObject.getInterface(PLAYER_INTERFACE);
      this.propertiesInterface = proxyObject.getInterface(PROPERTIES_INTERFACE);

      this.connected = true;
      return true;
    } catch (error) {
      console.error("Failed to connect to MPRIS:", error);
      return false;
    }
  }

  /**
   * Find the spotifyd MPRIS service on D-Bus
   */
  private async findSpotifydService(): Promise<string | null> {
    if (!this.bus) return null;

    try {
      const dbusProxy = await this.bus.getProxyObject(
        "org.freedesktop.DBus",
        "/org/freedesktop/DBus"
      );
      const dbusInterface = dbusProxy.getInterface("org.freedesktop.DBus");

      const names: string[] = await dbusInterface.ListNames();

      // Look for spotifyd or spotify MPRIS services
      const spotifyService = names.find(
        (name) =>
          name.startsWith(`${MPRIS_PREFIX}.spotifyd`) ||
          name.startsWith(`${MPRIS_PREFIX}.spotify`) ||
          name === `${MPRIS_PREFIX}.spotifyd`
      );

      return spotifyService || null;
    } catch (error) {
      console.error("Failed to list D-Bus names:", error);
      return null;
    }
  }

  /**
   * Check if connected to MPRIS
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Disconnect from D-Bus
   */
  disconnect(): void {
    if (this.bus) {
      this.bus.disconnect();
      this.bus = null;
    }
    this.playerInterface = null;
    this.propertiesInterface = null;
    this.connected = false;
  }

  // ─────────────────────────────────────────────────────────────
  // Playback Controls
  // ─────────────────────────────────────────────────────────────

  /**
   * Start or resume playback
   */
  async play(): Promise<void> {
    await this.playerInterface?.Play();
  }

  /**
   * Pause playback
   */
  async pause(): Promise<void> {
    await this.playerInterface?.Pause();
  }

  /**
   * Toggle play/pause
   */
  async playPause(): Promise<void> {
    await this.playerInterface?.PlayPause();
  }

  /**
   * Skip to next track
   */
  async next(): Promise<void> {
    await this.playerInterface?.Next();
  }

  /**
   * Go to previous track
   */
  async previous(): Promise<void> {
    await this.playerInterface?.Previous();
  }

  /**
   * Stop playback
   */
  async stop(): Promise<void> {
    await this.playerInterface?.Stop();
  }

  /**
   * Seek to position in microseconds
   */
  async seek(offsetMicroseconds: number): Promise<void> {
    await this.playerInterface?.Seek(BigInt(offsetMicroseconds));
  }

  /**
   * Set position in track (absolute)
   */
  async setPosition(trackId: string, positionMicroseconds: number): Promise<void> {
    await this.playerInterface?.SetPosition(
      trackId,
      BigInt(positionMicroseconds)
    );
  }

  // ─────────────────────────────────────────────────────────────
  // Properties
  // ─────────────────────────────────────────────────────────────

  /**
   * Get a property from the Player interface
   */
  private async getProperty<T>(propertyName: string): Promise<T | null> {
    if (!this.propertiesInterface) return null;
    try {
      const variant = await this.propertiesInterface.Get(
        PLAYER_INTERFACE,
        propertyName
      );
      return variant.value as T;
    } catch (error) {
      // Property might not exist
      return null;
    }
  }

  /**
   * Set a property on the Player interface
   */
  private async setProperty(
    propertyName: string,
    value: dbus.Variant
  ): Promise<void> {
    if (!this.propertiesInterface) return;
    await this.propertiesInterface.Set(PLAYER_INTERFACE, propertyName, value);
  }

  /**
   * Get current playback status
   */
  async getPlaybackStatus(): Promise<PlaybackStatus> {
    const status = await this.getProperty<string>("PlaybackStatus");
    return (status as PlaybackStatus) || "Stopped";
  }

  /**
   * Get current track metadata
   */
  async getMetadata(): Promise<MprisMetadata | null> {
    const metadata = await this.getProperty<Record<string, dbus.Variant>>(
      "Metadata"
    );
    if (!metadata) return null;

    return this.parseMetadata(metadata);
  }

  /**
   * Parse MPRIS metadata into our format
   */
  private parseMetadata(
    metadata: Record<string, dbus.Variant>
  ): MprisMetadata {
    const get = <T>(key: string, defaultValue: T): T => {
      const variant = metadata[key];
      if (!variant) return defaultValue;
      return (variant.value as T) ?? defaultValue;
    };

    return {
      trackId: get("mpris:trackid", ""),
      title: get("xesam:title", "Unknown"),
      artist: get("xesam:artist", ["Unknown"]),
      album: get("xesam:album", "Unknown"),
      albumArtist: get("xesam:albumArtist", []),
      artUrl: get("mpris:artUrl", ""),
      length: Number(get("mpris:length", BigInt(0))),
      url: get("xesam:url", ""),
    };
  }

  /**
   * Get current position in microseconds
   */
  async getPosition(): Promise<number> {
    const position = await this.getProperty<bigint>("Position");
    return Number(position || 0);
  }

  /**
   * Get current volume (0.0 to 1.0)
   */
  async getVolume(): Promise<number> {
    const volume = await this.getProperty<number>("Volume");
    return volume ?? 1.0;
  }

  /**
   * Set volume (0.0 to 1.0)
   */
  async setVolume(volume: number): Promise<void> {
    const clamped = Math.max(0, Math.min(1, volume));
    await this.setProperty("Volume", new dbus.Variant("d", clamped));
  }

  /**
   * Get shuffle state
   */
  async getShuffle(): Promise<boolean> {
    const shuffle = await this.getProperty<boolean>("Shuffle");
    return shuffle ?? false;
  }

  /**
   * Set shuffle state
   */
  async setShuffle(shuffle: boolean): Promise<void> {
    await this.setProperty("Shuffle", new dbus.Variant("b", shuffle));
  }

  /**
   * Get loop status
   */
  async getLoopStatus(): Promise<LoopStatus> {
    const status = await this.getProperty<string>("LoopStatus");
    return (status as LoopStatus) || "None";
  }

  /**
   * Set loop status
   */
  async setLoopStatus(status: LoopStatus): Promise<void> {
    await this.setProperty("LoopStatus", new dbus.Variant("s", status));
  }

  // ─────────────────────────────────────────────────────────────
  // Convenience Methods
  // ─────────────────────────────────────────────────────────────

  /**
   * Get full player state
   */
  async getPlayerState(): Promise<MprisPlayerState | null> {
    if (!this.connected) return null;

    const [
      playbackStatus,
      metadata,
      position,
      volume,
      shuffle,
      loopStatus,
    ] = await Promise.all([
      this.getPlaybackStatus(),
      this.getMetadata(),
      this.getPosition(),
      this.getVolume(),
      this.getShuffle(),
      this.getLoopStatus(),
    ]);

    return {
      playbackStatus,
      metadata,
      position,
      volume,
      canGoNext: true,
      canGoPrevious: true,
      canPlay: true,
      canPause: true,
      canSeek: true,
      shuffle,
      loopStatus,
    };
  }

  /**
   * Get simplified now playing info for UI
   */
  async getNowPlaying(): Promise<NowPlayingInfo | null> {
    if (!this.connected) return null;

    const [playbackStatus, metadata, position, volume, shuffle, loopStatus] = await Promise.all([
      this.getPlaybackStatus(),
      this.getMetadata(),
      this.getPosition(),
      this.getVolume(),
      this.getShuffle(),
      this.getLoopStatus(),
    ]);

    if (!metadata) return null;

    return {
      title: metadata.title,
      artist: metadata.artist.join(", "),
      album: metadata.album,
      artUrl: metadata.artUrl,
      durationMs: Math.floor(metadata.length / 1000),
      positionMs: Math.floor(position / 1000),
      isPlaying: playbackStatus === "Playing",
      volume,
      shuffle,
      loopStatus,
    };
  }

  /**
   * Volume up by percentage (default 5%)
   */
  async volumeUp(amount: number = 0.05): Promise<void> {
    const current = await this.getVolume();
    await this.setVolume(current + amount);
  }

  /**
   * Volume down by percentage (default 5%)
   */
  async volumeDown(amount: number = 0.05): Promise<void> {
    const current = await this.getVolume();
    await this.setVolume(current - amount);
  }

  /**
   * Toggle shuffle (uses cached state for instant response)
   * @param currentState - The current shuffle state from cache (avoids D-Bus read)
   * @returns The new shuffle state
   */
  async toggleShuffle(currentState?: boolean): Promise<boolean> {
    // If current state is provided, skip the D-Bus read
    const current = currentState ?? await this.getShuffle();
    const newState = !current;
    await this.setShuffle(newState);
    return newState;
  }

  /**
   * Cycle loop status: None -> Playlist -> Track -> None
   * @param currentStatus - The current loop status from cache (avoids D-Bus read)
   * @returns The new loop status
   */
  async cycleLoopStatus(currentStatus?: LoopStatus): Promise<LoopStatus> {
    // If current status is provided, skip the D-Bus read
    const current = currentStatus ?? await this.getLoopStatus();
    const next: LoopStatus =
      current === "None" ? "Playlist" : current === "Playlist" ? "Track" : "None";
    await this.setLoopStatus(next);
    return next;
  }

  /**
   * Seek forward by milliseconds
   */
  async seekForward(ms: number = 10000): Promise<void> {
    await this.seek(ms * 1000); // Convert to microseconds
  }

  /**
   * Seek backward by milliseconds
   */
  async seekBackward(ms: number = 10000): Promise<void> {
    await this.seek(-ms * 1000); // Convert to microseconds
  }
}

// Singleton instance
let mprisServiceInstance: MprisService | null = null;

export function getMprisService(): MprisService {
  if (!mprisServiceInstance) {
    mprisServiceInstance = new MprisService();
  }
  return mprisServiceInstance;
}
