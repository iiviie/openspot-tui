import type { ColorScheme } from "../types";

/**
 * Dark color scheme
 * Matched to Claude Code's terminal UI
 */
export const colors: ColorScheme = {
	bg: "#0d1117", // Very dark background (like GitHub dark)
	bgSecondary: "#161b22", // Slightly lighter for panels/modals
	border: "#30363d", // Subtle borders
	textPrimary: "#c9d1d9", // Light gray text
	textSecondary: "#8b949e", // Muted text
	textDim: "#484f58", // Very muted text
	accent: "#21262d", // Selection highlight
	highlight: "#30363d", // Hover/focus highlight
	success: "#3fb950", // green
	warning: "#d29922", // amber
	error: "#f85149", // red
};

/**
 * Alternative color schemes for future use
 */
export const colorSchemes = {
	zinc: colors,

	// Spotify-inspired green theme
	spotify: {
		bg: "#121212",
		bgSecondary: "#181818",
		border: "#282828",
		textPrimary: "#ffffff",
		textSecondary: "#b3b3b3",
		textDim: "#535353",
		accent: "#1db954",
		highlight: "#1ed760",
		success: "#1db954",
		warning: "#f59e0b",
		error: "#e91429",
	} satisfies ColorScheme,

	// Blue theme
	ocean: {
		bg: "#0f172a",
		bgSecondary: "#1e293b",
		border: "#334155",
		textPrimary: "#f8fafc",
		textSecondary: "#94a3b8",
		textDim: "#64748b",
		accent: "#3b82f6",
		highlight: "#60a5fa",
		success: "#22c55e",
		warning: "#f59e0b",
		error: "#ef4444",
	} satisfies ColorScheme,
};
