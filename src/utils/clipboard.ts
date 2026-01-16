import { spawnSync } from "node:child_process";
import { getLogger } from "./Logger";

const logger = getLogger("Clipboard");

/**
 * Copy text to clipboard using various methods
 */
export async function copyToClipboard(text: string): Promise<boolean> {
	// Try OSC52 first (works in many modern terminals)
	try {
		const success = await copyViaOSC52(text);
		if (success) {
			logger.debug("Copied via OSC52");
			return true;
		}
	} catch (error) {
		logger.debug("OSC52 failed:", error);
	}

	// Try platform-specific tools
	try {
		const success = copyViaPlatformTool(text);
		if (success) {
			logger.debug("Copied via platform tool");
			return true;
		}
	} catch (error) {
		logger.debug("Platform tool failed:", error);
	}

	return false;
}

/**
 * Copy using OSC52 escape sequence
 * Works in: iTerm2, tmux, screen, some modern terminals
 */
function copyViaOSC52(text: string): Promise<boolean> {
	return new Promise((resolve) => {
		try {
			const base64 = Buffer.from(text).toString("base64");
			// OSC 52 ; c ; <base64> ST
			const osc52 = `\x1b]52;c;${base64}\x07`;

			// Write to stdout
			process.stdout.write(osc52);

			// Give it a moment to process
			setTimeout(() => resolve(true), 100);
		} catch {
			resolve(false);
		}
	});
}

/**
 * Copy using platform-specific clipboard tools
 */
function copyViaPlatformTool(text: string): boolean {
	const platform = process.platform;

	let command: string;
	let args: string[];

	if (platform === "darwin") {
		// macOS
		command = "pbcopy";
		args = [];
	} else if (platform === "linux") {
		// Try xclip first
		if (isCommandAvailable("xclip")) {
			command = "xclip";
			args = ["-selection", "clipboard"];
		}
		// Try xsel
		else if (isCommandAvailable("xsel")) {
			command = "xsel";
			args = ["--clipboard", "--input"];
		}
		// Try wl-copy (Wayland)
		else if (isCommandAvailable("wl-copy")) {
			command = "wl-copy";
			args = [];
		} else {
			return false;
		}
	} else {
		// Windows or other platforms not supported
		return false;
	}

	try {
		const result = spawnSync(command, args, {
			input: text,
			encoding: "utf-8",
			timeout: 1000,
		});

		return result.status === 0;
	} catch {
		return false;
	}
}

/**
 * Check if a command is available
 */
function isCommandAvailable(command: string): boolean {
	try {
		const result = spawnSync("which", [command], {
			encoding: "utf-8",
			timeout: 1000,
		});
		return result.status === 0;
	} catch {
		return false;
	}
}
