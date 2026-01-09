import type { ColorScheme } from "../types";

/**
 * Zinc/Gray color scheme
 * Based on Tailwind CSS zinc color palette
 */
export const colors: ColorScheme = {
	bg: "#18181b", // zinc-900
	bgSecondary: "#27272a", // zinc-800
	border: "#3f3f46", // zinc-700
	textPrimary: "#fafafa", // zinc-50
	textSecondary: "#a1a1aa", // zinc-400
	textDim: "#71717a", // zinc-500
	accent: "#52525b", // zinc-600
	highlight: "#d4d4d8", // zinc-300
	success: "#22c55e", // green-500
	warning: "#f59e0b", // amber-500
	error: "#ef4444", // red-500
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
