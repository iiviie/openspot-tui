/**
 * Zod schemas for Spotify API response validation
 * Provides runtime type safety and graceful error handling
 */

import { z } from "zod";

// ============================================================================
// Base Types
// ============================================================================

/**
 * Spotify external URLs
 */
const ExternalUrlsSchema = z.object({
  spotify: z.string().url(),
}).passthrough(); // Allow additional fields

/**
 * Spotify image object
 */
const ImageSchema = z.object({
  url: z.string().url(),
  height: z.number().nullable().optional(),
  width: z.number().nullable().optional(),
});

/**
 * Spotify followers object
 */
const FollowersSchema = z.object({
  href: z.string().url().nullable(),
  total: z.number(),
});

// ============================================================================
// Artist
// ============================================================================

export const SpotifyArtistSchema = z.object({
  id: z.string(),
  name: z.string(),
  uri: z.string(),
  href: z.string().url(),
  external_urls: ExternalUrlsSchema,
  type: z.literal("artist"),
  images: z.array(ImageSchema).optional(),
  followers: FollowersSchema.optional(),
  genres: z.array(z.string()).optional(),
  popularity: z.number().min(0).max(100).optional(),
});

// Simplified artist (used in tracks)
export const SimplifiedArtistSchema = z.object({
  id: z.string(),
  name: z.string(),
  uri: z.string(),
  href: z.string().url(),
  external_urls: ExternalUrlsSchema,
  type: z.literal("artist"),
});

// ============================================================================
// Album
// ============================================================================

export const SimplifiedAlbumSchema = z.object({
  id: z.string(),
  name: z.string(),
  uri: z.string(),
  href: z.string().url(),
  external_urls: ExternalUrlsSchema,
  type: z.literal("album"),
  album_type: z.enum(["album", "single", "compilation"]),
  images: z.array(ImageSchema),
  release_date: z.string(),
  release_date_precision: z.enum(["year", "month", "day"]),
  total_tracks: z.number(),
  artists: z.array(SimplifiedArtistSchema),
});

export const SpotifyAlbumSchema = SimplifiedAlbumSchema.extend({
  genres: z.array(z.string()),
  label: z.string(),
  popularity: z.number().min(0).max(100),
  tracks: z.object({
    items: z.array(z.any()), // Simplified tracks
    total: z.number(),
  }),
});

// ============================================================================
// Track
// ============================================================================

export const SpotifyTrackSchema = z.object({
  id: z.string(),
  name: z.string(),
  uri: z.string(),
  href: z.string().url(),
  external_urls: ExternalUrlsSchema,
  type: z.literal("track"),
  duration_ms: z.number().min(0),
  explicit: z.boolean(),
  popularity: z.number().min(0).max(100).optional(),
  preview_url: z.string().url().nullable(),
  track_number: z.number().min(1),
  disc_number: z.number().min(1).optional().default(1),
  is_local: z.boolean().optional().default(false),
  is_playable: z.boolean().optional().default(true),
  artists: z.array(SimplifiedArtistSchema),
  album: SimplifiedAlbumSchema,
});

// ============================================================================
// Playlist
// ============================================================================

export const SpotifyPlaylistSchema = z.object({
  id: z.string(),
  name: z.string(),
  uri: z.string(),
  href: z.string().url(),
  external_urls: ExternalUrlsSchema,
  type: z.literal("playlist"),
  description: z.string().nullable(),
  public: z.boolean().nullable(),
  collaborative: z.boolean(),
  images: z.array(ImageSchema),
  owner: z.object({
    id: z.string(),
    display_name: z.string().nullable(),
    uri: z.string(),
  }),
  tracks: z.object({
    href: z.string().url(),
    total: z.number(),
  }),
  snapshot_id: z.string(),
});

// ============================================================================
// Paginated Responses
// ============================================================================

export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    href: z.string().url(),
    items: z.array(itemSchema),
    limit: z.number(),
    next: z.string().url().nullable(),
    offset: z.number(),
    previous: z.string().url().nullable(),
    total: z.number(),
  });

// Specific paginated types
export const PaginatedTracksSchema = PaginatedResponseSchema(SpotifyTrackSchema);
export const PaginatedPlaylistsSchema = PaginatedResponseSchema(SpotifyPlaylistSchema);
export const PaginatedAlbumsSchema = PaginatedResponseSchema(SpotifyAlbumSchema);
export const PaginatedArtistsSchema = PaginatedResponseSchema(SpotifyArtistSchema);

// ============================================================================
// Saved Items
// ============================================================================

export const SavedTrackSchema = z.object({
  added_at: z.string(),
  track: SpotifyTrackSchema,
});

export const PaginatedSavedTracksSchema = PaginatedResponseSchema(SavedTrackSchema);

// ============================================================================
// Playlist Tracks
// ============================================================================

export const PlaylistTrackSchema = z.object({
  added_at: z.string(),
  added_by: z.object({
    id: z.string(),
    uri: z.string(),
  }),
  is_local: z.boolean(),
  track: SpotifyTrackSchema.nullable(),
});

export const PaginatedPlaylistTracksSchema = PaginatedResponseSchema(PlaylistTrackSchema);

// ============================================================================
// Search Results
// ============================================================================

export const SearchResultsSchema = z.object({
  tracks: PaginatedTracksSchema.optional(),
  artists: PaginatedArtistsSchema.optional(),
  albums: PaginatedAlbumsSchema.optional(),
  playlists: PaginatedPlaylistsSchema.optional(),
});

// ============================================================================
// Currently Playing
// ============================================================================

export const CurrentlyPlayingSchema = z.object({
  timestamp: z.number(),
  progress_ms: z.number().nullable(),
  is_playing: z.boolean(),
  item: SpotifyTrackSchema.nullable(),
  currently_playing_type: z.enum(["track", "episode", "ad", "unknown"]),
  device: z.object({
    id: z.string().nullable(),
    name: z.string(),
    type: z.string(),
    volume_percent: z.number().min(0).max(100).nullable(),
    is_active: z.boolean(),
  }).nullable(),
  repeat_state: z.enum(["off", "track", "context"]),
  shuffle_state: z.boolean(),
});

// ============================================================================
// Type exports (inferred from schemas)
// ============================================================================

export type ValidatedSpotifyTrack = z.infer<typeof SpotifyTrackSchema>;
export type ValidatedSpotifyAlbum = z.infer<typeof SpotifyAlbumSchema>;
export type ValidatedSpotifyArtist = z.infer<typeof SpotifyArtistSchema>;
export type ValidatedSpotifyPlaylist = z.infer<typeof SpotifyPlaylistSchema>;
export type ValidatedSavedTrack = z.infer<typeof SavedTrackSchema>;
export type ValidatedSearchResults = z.infer<typeof SearchResultsSchema>;
export type ValidatedCurrentlyPlaying = z.infer<typeof CurrentlyPlayingSchema>;

// ============================================================================
// Helper: Safe Parse with Error Logging
// ============================================================================

export function safeValidate<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context: string
): T | null {
  const result = schema.safeParse(data);
  
  if (!result.success) {
    console.error(`[Validation Error] ${context}:`);
    console.error(result.error.issues);
    return null;
  }
  
  return result.data;
}

// ============================================================================
// Helper: Parse with Fallback
// ============================================================================

export function validateOrDefault<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  fallback: T,
  context: string
): T {
  const validated = safeValidate(schema, data, context);
  return validated ?? fallback;
}
