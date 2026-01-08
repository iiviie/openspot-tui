/**
 * Spotify API Types
 */

/**
 * OAuth2 tokens returned from Spotify
 */
export interface SpotifyTokens {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

/**
 * Stored credentials with expiration timestamp
 */
export interface StoredCredentials {
  access_token: string;
  refresh_token: string;
  expires_at: number; // Unix timestamp in milliseconds
  scope: string;
}

/**
 * Auth configuration
 */
export interface AuthConfig {
  clientId: string;
  redirectUri: string;
  scopes: string[];
}

/**
 * PKCE challenge pair
 */
export interface PKCEChallenge {
  codeVerifier: string;
  codeChallenge: string;
}

/**
 * Spotify user profile
 */
export interface SpotifyUser {
  id: string;
  display_name: string | null;
  email?: string;
  country?: string;
  product?: "free" | "premium" | "open";
  images?: SpotifyImage[];
}

/**
 * Spotify image
 */
export interface SpotifyImage {
  url: string;
  height: number | null;
  width: number | null;
}

/**
 * Spotify artist (simplified)
 */
export interface SpotifyArtist {
  id: string;
  name: string;
  uri: string;
  href: string;
}

/**
 * Spotify album (simplified)
 */
export interface SpotifyAlbum {
  id: string;
  name: string;
  uri: string;
  href: string;
  images: SpotifyImage[];
  release_date: string;
  artists: SpotifyArtist[];
}

/**
 * Spotify track
 */
export interface SpotifyTrack {
  id: string;
  name: string;
  uri: string;
  href: string;
  duration_ms: number;
  artists: SpotifyArtist[];
  album: SpotifyAlbum;
  is_playable?: boolean;
  popularity?: number;
  track_number?: number;
}

/**
 * Spotify playlist (simplified)
 */
export interface SpotifyPlaylist {
  id: string;
  name: string;
  uri: string;
  href: string;
  description: string | null;
  images: SpotifyImage[];
  owner: {
    id: string;
    display_name: string | null;
  };
  tracks: {
    total: number;
    href: string;
  };
  public: boolean | null;
}

/**
 * Spotify playlist track item
 */
export interface SpotifyPlaylistTrack {
  added_at: string;
  track: SpotifyTrack | null;
}

/**
 * Paginated response from Spotify API
 */
export interface SpotifyPaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  next: string | null;
  previous: string | null;
  href: string;
}

/**
 * Currently playing response
 */
export interface SpotifyCurrentlyPlaying {
  is_playing: boolean;
  progress_ms: number | null;
  item: SpotifyTrack | null;
  device?: {
    id: string;
    name: string;
    type: string;
    volume_percent: number;
  };
  shuffle_state?: boolean;
  repeat_state?: "off" | "track" | "context";
}

/**
 * Saved track item
 */
export interface SpotifySavedTrack {
  added_at: string;
  track: SpotifyTrack;
}

/**
 * Saved album item
 */
export interface SpotifySavedAlbum {
  added_at: string;
  album: SpotifyAlbum & {
    tracks: SpotifyPaginatedResponse<SpotifyTrack>;
  };
}

/**
 * Search results
 */
export interface SpotifySearchResults {
  tracks?: SpotifyPaginatedResponse<SpotifyTrack>;
  artists?: SpotifyPaginatedResponse<SpotifyArtist>;
  albums?: SpotifyPaginatedResponse<SpotifyAlbum>;
  playlists?: SpotifyPaginatedResponse<SpotifyPlaylist>;
}

/**
 * Spotify API error response
 */
export interface SpotifyApiError {
  error: {
    status: number;
    message: string;
  };
}
