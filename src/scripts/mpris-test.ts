/**
 * MPRIS Test Script
 * Run with: bun run src/scripts/mpris-test.ts
 *
 * Make sure spotifyd is running first: spotifyd --no-daemon
 */

import { getMprisService } from "../services";

async function main() {
	console.log("🎵 MPRIS Test - Controlling spotifyd\n");
	console.log("=".repeat(50));

	const mpris = getMprisService();

	// Connect to spotifyd
	console.log("\n📡 Connecting to spotifyd via D-Bus...");
	const connected = await mpris.connect();

	if (!connected) {
		console.error("\n❌ Failed to connect to spotifyd!");
		console.log("\nMake sure spotifyd is running:");
		console.log("  spotifyd --no-daemon");
		process.exit(1);
	}

	console.log("✅ Connected to spotifyd!\n");

	// Get current state
	console.log("📊 Current State:");
	console.log("=".repeat(50));

	const nowPlaying = await mpris.getNowPlaying();

	if (nowPlaying) {
		console.log(`🎵 Title:    ${nowPlaying.title}`);
		console.log(`👤 Artist:   ${nowPlaying.artist}`);
		console.log(`💿 Album:    ${nowPlaying.album}`);
		console.log(`⏱️  Duration: ${formatTime(nowPlaying.durationMs)}`);
		console.log(`📍 Position: ${formatTime(nowPlaying.positionMs)}`);
		console.log(`▶️  Playing:  ${nowPlaying.isPlaying ? "Yes" : "No"}`);
		console.log(`🔊 Volume:   ${Math.round(nowPlaying.volume * 100)}%`);
	} else {
		console.log("No track currently loaded.");
		console.log(
			"\nTry playing something on Spotify and selecting 'spotify-tui' as the device.",
		);
	}

	console.log(`\n${"=".repeat(50)}`);

	// Interactive test
	console.log("\n🎮 Available Commands:");
	console.log("  p  - Play/Pause");
	console.log("  n  - Next track");
	console.log("  b  - Previous track");
	console.log("  +  - Volume up");
	console.log("  -  - Volume down");
	console.log("  s  - Show current state");
	console.log("  q  - Quit\n");

	// Set up stdin for interactive testing
	process.stdin.setRawMode(true);
	process.stdin.resume();
	process.stdin.setEncoding("utf8");

	process.stdin.on("data", async (key: string) => {
		switch (key) {
			case "p":
				console.log("⏯️  Toggle Play/Pause");
				await mpris.playPause();
				break;
			case "n":
				console.log("⏭️  Next track");
				await mpris.next();
				break;
			case "b":
				console.log("⏮️  Previous track");
				await mpris.previous();
				break;
			case "+":
			case "=":
				console.log("🔊 Volume up");
				await mpris.volumeUp();
				break;
			case "-":
				console.log("🔉 Volume down");
				await mpris.volumeDown();
				break;
			case "s": {
				const state = await mpris.getNowPlaying();
				if (state) {
					console.log(`\n🎵 ${state.title} - ${state.artist}`);
					console.log(
						`   ${state.isPlaying ? "▶️" : "⏸️"} ${formatTime(state.positionMs)} / ${formatTime(state.durationMs)} | Vol: ${Math.round(state.volume * 100)}%`,
					);
				}
				break;
			}
			case "q":
			case "\u0003": // Ctrl+C
				console.log("\n👋 Bye!");
				mpris.disconnect();
				process.exit(0);
				break;
		}
	});

	console.log("Listening for commands... (press 'q' to quit)\n");
}

function formatTime(ms: number): string {
	const totalSeconds = Math.floor(ms / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

// Run
main().catch((err) => {
	console.error("Error:", err);
	process.exit(1);
});
