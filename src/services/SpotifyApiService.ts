/**
 * Spotify Web API Service
 * Handles all Spotify Web API calls for search, playback, library, etc.
 */

import { getAuthService, SPOTIFY_CLIENT_ID } from "./AuthService";
import type {
  SpotifySearchResults,
  SpotifyTrack,
  SpotifyAlbum,
  SpotifyArtist,
  SpotifyPlaylist,
  SpotifyPaginatedResponse,
  SpotifyCurrentlyPlaying,
  SpotifySavedTrack,
} from "../types/spotify";

const API_BASE = "https://api.spotify.com/v1";

/**
 * Spotify Web API Service
 */
export class SpotifyApiService {
  private authService = getAuthService(SPOTIFY_CLIENT_ID);

  /**
   * Make an authenticated API request
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = await this.authService.getValidAccessToken();

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    // Handle rate limiting
    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get("Retry-After") || "5", 10);
      throw new Error(`Rate limited. Retry after ${retryAfter} seconds.`);
    }

    // Handle no content responses
    if (response.status === 204) {
      return {} as T;
    }

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API error ${response.status}: ${error}`);
    }

    return response.json() as Promise<T>;
  }

  // ─────────────────────────────────────────────────────────────
  // Search
  // ─────────────────────────────────────────────────────────────

  /**
   * Search for tracks, artists, albums, or playlists
   */
  async search(
    query: string,
    types: ("track" | "artist" | "album" | "playlist")[] = ["track"],
    limit: number = 20
  ): Promise<SpotifySearchResults> {
    const params = new URLSearchParams({
      q: query,
      type: types.join(","),
      limit: limit.toString(),
    });

    return this.request<SpotifySearchResults>(`/search?${params}`);
  }

  /**
   * Search for tracks only
   */
  async searchTracks(query: string, limit: number = 20): Promise<SpotifyTrack[]> {
    const results = await this.search(query, ["track"], limit);
    return results.tracks?.items || [];
  }

  /**
   * Search for artists only
   */
  async searchArtists(query: string, limit: number = 20): Promise<SpotifyArtist[]> {
    const results = await this.search(query, ["artist"], limit);
    return results.artists?.items || [];
  }

  /**
   * Search for albums only
   */
  async searchAlbums(query: string, limit: number = 20): Promise<SpotifyAlbum[]> {
    const results = await this.search(query, ["album"], limit);
    return results.albums?.items || [];
  }

  /**
   * Search for playlists only
   */
  async searchPlaylists(query: string, limit: number = 20): Promise<SpotifyPlaylist[]> {
    const results = await this.search(query, ["playlist"], limit);
    return results.playlists?.items || [];
  }

  // ─────────────────────────────────────────────────────────────
  // Playback Control
  // ─────────────────────────────────────────────────────────────

  /**
   * Get available devices
   */
  async getDevices(): Promise<{ devices: Array<{ id: string; name: string; is_active: boolean; type: string }> }> {
    return this.request("/me/player/devices");
  }

  /**
   * Get the current playback state
   */
  async getPlaybackState(): Promise<SpotifyCurrentlyPlaying | null> {
    try {
      return await this.request<SpotifyCurrentlyPlaying>("/me/player");
    } catch {
      return null;
    }
  }

  /**
   * Start or resume playback
   * @param options - Play options (uris, context_uri, device_id, etc.)
   */
  async play(options: {
    device_id?: string;
    context_uri?: string; // Album, artist, or playlist URI
    uris?: string[]; // List of track URIs
    offset?: { position: number } | { uri: string };
    position_ms?: number;
  } = {}): Promise<void> {
    const params = options.device_id ? `?device_id=${options.device_id}` : "";
    const body: Record<string, unknown> = {};

    if (options.context_uri) body.context_uri = options.context_uri;
    if (options.uris) body.uris = options.uris;
    if (options.offset) body.offset = options.offset;
    if (options.position_ms !== undefined) body.position_ms = options.position_ms;

    await this.request(`/me/player/play${params}`, {
      method: "PUT",
      body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * Play a specific track by URI
   */
  async playTrack(trackUri: string, deviceId?: string): Promise<void> {
    await this.play({
      uris: [trackUri],
      device_id: deviceId,
    });
  }

  /**
   * Play a context (album, artist, playlist) optionally starting at a specific track
   */
  async playContext(
    contextUri: string,
    trackUri?: string,
    deviceId?: string
  ): Promise<void> {
    await this.play({
      context_uri: contextUri,
      offset: trackUri ? { uri: trackUri } : undefined,
      device_id: deviceId,
    });
  }

  /**
   * Pause playback
   */
  async pause(deviceId?: string): Promise<void> {
    const params = deviceId ? `?device_id=${deviceId}` : "";
    await this.request(`/me/player/pause${params}`, { method: "PUT" });
  }

  /**
   * Skip to next track
   */
  async next(deviceId?: string): Promise<void> {
    const params = deviceId ? `?device_id=${deviceId}` : "";
    await this.request(`/me/player/next${params}`, { method: "POST" });
  }

  /**
   * Skip to previous track
   */
  async previous(deviceId?: string): Promise<void> {
    const params = deviceId ? `?device_id=${deviceId}` : "";
    await this.request(`/me/player/previous${params}`, { method: "POST" });
  }

  /**
   * Add a track to the queue
   */
  async addToQueue(trackUri: string, deviceId?: string): Promise<void> {
    const params = new URLSearchParams({ uri: trackUri });
    if (deviceId) params.append("device_id", deviceId);
    await this.request(`/me/player/queue?${params}`, { method: "POST" });
  }

  /**
   * Transfer playback to a device
   */
  async transferPlayback(deviceId: string, play: boolean = true): Promise<void> {
    await this.request("/me/player", {
      method: "PUT",
      body: JSON.stringify({
        device_ids: [deviceId],
        play,
      }),
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Library
  // ─────────────────────────────────────────────────────────────

  /**
   * Get user's saved tracks
   */
  async getSavedTracks(
    limit: number = 50,
    offset: number = 0
  ): Promise<SpotifyPaginatedResponse<SpotifySavedTrack>> {
    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
    });
    return this.request(`/me/tracks?${params}`);
  }

  /**
   * Get user's playlists
   */
  async getPlaylists(
    limit: number = 50,
    offset: number = 0
  ): Promise<SpotifyPaginatedResponse<SpotifyPlaylist>> {
    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
    });
    return this.request(`/me/playlists?${params}`);
  }

  /**
   * Get tracks in a playlist
   */
  async getPlaylistTracks(
    playlistId: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<SpotifyPaginatedResponse<{ track: SpotifyTrack | null }>> {
    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
    });
    return this.request(`/playlists/${playlistId}/tracks?${params}`);
  }

  /**
   * Get an album's tracks
   */
  async getAlbumTracks(
    albumId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<SpotifyPaginatedResponse<SpotifyTrack>> {
    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
    });
    return this.request(`/albums/${albumId}/tracks?${params}`);
  }

  /**
   * Get an artist's top tracks
   */
  async getArtistTopTracks(artistId: string, market: string = "US"): Promise<{ tracks: SpotifyTrack[] }> {
    return this.request(`/artists/${artistId}/top-tracks?market=${market}`);
  }
}

// Singleton instance
let spotifyApiInstance: SpotifyApiService | null = null;

export function getSpotifyApiService(): SpotifyApiService {
  if (!spotifyApiInstance) {
    spotifyApiInstance = new SpotifyApiService();
  }
  return spotifyApiInstance;
}
