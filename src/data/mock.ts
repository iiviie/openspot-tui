import type { CurrentTrack, Track } from "../types";

/**
 * Mock current track data
 */
export const mockCurrentTrack: CurrentTrack = {
  title: "Starlight",
  artist: "Tycho",
  album: "Epoch",
  currentTime: "2:34",
  totalTime: "4:15",
  progress: 0.56,
  isPlaying: true,
};

/**
 * Mock queue data
 */
export const mockQueue: Track[] = [
  { title: "Starlight", artist: "Tycho" },
  { title: "Your Hath Chess", album: "Epoch" },
  { title: "Line On Uw", album: "Epoch" },
  { title: "Starlight", artist: "Tycho" },
  { title: "Sunmerrcy", artist: "Tycho" },
  { title: "Tanona Moving Point", album: "Tycho" },
  { title: "Feels of Switch", artist: "Tycho" },
  { title: "Utoto a Tycho", artist: "Tycho" },
  { title: "The Starlight", artist: "Tycho" },
];

/**
 * Format track display string
 */
export function formatTrackDisplay(track: Track): string {
  if (track.artist) {
    return `${track.title} - ${track.artist}`;
  }
  if (track.album) {
    return `${track.title} | Album: ${track.album}`;
  }
  return track.title;
}
