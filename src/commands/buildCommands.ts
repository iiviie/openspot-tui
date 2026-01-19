import type { Command } from "../components";
import type { IMprisService } from "../types/mpris";
import type { SpotifyApiService, SpotifydManager } from "../services";
import type { ContentWindow } from "../components/ContentWindow";
import type { ToastManager } from "../components/ToastManager";
import type { SearchBar } from "../components/SearchBar";

/**
 * Callbacks required by command definitions
 * Commands are pure - they call these callbacks to perform actions
 */
export interface CommandCallbacks {
	// Account
	loginToSpotify: () => Promise<void>;
	logoutFromSpotify: () => Promise<void>;

	// Spotifyd
	authenticateSpotifyd: () => Promise<void>;
	startSpotifyd: () => Promise<void>;
	stopSpotifyd: () => Promise<void>;
	restartSpotifyd: () => Promise<void>;
	activateSpotifyd: () => Promise<void>;

	// Playback
	handlePlaybackControl: (keyName: string) => Promise<void>;

	// Navigation
	activateSearch: () => void;
	focusLibrary: () => void;
	focusContent: () => void;

	// Application
	quit: () => void;

	// State access
	getIsPlaying: () => boolean;
	updateConnectionStatus: () => void;
}

/**
 * Build the list of commands for the command palette
 * This is a pure function - all actions are callbacks
 *
 * @param callbacks - Action callbacks to execute commands
 * @returns Array of commands for the command palette
 */
export function buildCommands(callbacks: CommandCallbacks): Command[] {
	return [
		// Account section
		{
			id: "api-login",
			label: "Login to Spotify",
			category: "Account",
			action: callbacks.loginToSpotify,
		},
		{
			id: "api-logout",
			label: "Logout",
			category: "Account",
			action: callbacks.logoutFromSpotify,
		},

		// Spotifyd section
		{
			id: "spotifyd-authenticate",
			label: "Authenticate Spotifyd",
			category: "Spotifyd",
			action: callbacks.authenticateSpotifyd,
		},
		{
			id: "spotifyd-start",
			label: "Start Spotifyd",
			category: "Spotifyd",
			action: callbacks.startSpotifyd,
		},
		{
			id: "spotifyd-stop",
			label: "Stop Spotifyd Daemon",
			category: "Spotifyd",
			action: callbacks.stopSpotifyd,
		},
		{
			id: "spotifyd-restart",
			label: "Restart Spotifyd Daemon",
			category: "Spotifyd",
			action: callbacks.restartSpotifyd,
		},
		{
			id: "spotifyd-activate",
			label: "Activate as Playback Device",
			category: "Spotifyd",
			action: callbacks.activateSpotifyd,
		},

		// Playback section
		{
			id: "playback-play-pause",
			label: "Play / Pause",
			shortcut: "space",
			category: "Playback",
			action: async () => await callbacks.handlePlaybackControl("space"),
		},
		{
			id: "playback-next",
			label: "Next Track",
			shortcut: "n",
			category: "Playback",
			action: async () => await callbacks.handlePlaybackControl("n"),
		},
		{
			id: "playback-previous",
			label: "Previous Track",
			shortcut: "p",
			category: "Playback",
			action: async () => await callbacks.handlePlaybackControl("p"),
		},
		{
			id: "playback-shuffle",
			label: "Toggle Shuffle",
			shortcut: "s",
			category: "Playback",
			action: async () => await callbacks.handlePlaybackControl("s"),
		},
		{
			id: "playback-repeat",
			label: "Cycle Repeat Mode",
			shortcut: "r",
			category: "Playback",
			action: async () => await callbacks.handlePlaybackControl("r"),
		},

		// Navigation section
		{
			id: "nav-search",
			label: "Search",
			shortcut: "/",
			category: "Navigation",
			action: callbacks.activateSearch,
		},
		{
			id: "nav-library",
			label: "Go to Library",
			shortcut: "h",
			category: "Navigation",
			action: callbacks.focusLibrary,
		},
		{
			id: "nav-content",
			label: "Go to Content",
			shortcut: "l",
			category: "Navigation",
			action: callbacks.focusContent,
		},

		// Application section
		{
			id: "app-quit",
			label: "Quit",
			shortcut: "q",
			category: "Application",
			action: callbacks.quit,
		},
	];
}
