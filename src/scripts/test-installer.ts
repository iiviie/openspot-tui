#!/usr/bin/env bun

/**
 * Automated Test Suite for Spotifyd Installer
 * Run this to verify all major scenarios work correctly
 */

import { existsSync, chmodSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getSpotifydInstaller } from "../services/SpotifydInstaller";

const BINARY_PATH = join(homedir(), ".spotify-tui", "bin", "spotifyd");
const CACHE_PATH = join(homedir(), ".spotify-tui", "bin", ".verified");

let testsPassed = 0;
let testsFailed = 0;

function log(message: string): void {
	console.log(`  ${message}`);
}

function success(message: string): void {
	console.log(`  ✅ ${message}`);
	testsPassed++;
}

function fail(message: string): void {
	console.error(`  ❌ ${message}`);
	testsFailed++;
}

function section(title: string): void {
	console.log(`\n${"=".repeat(60)}`);
	console.log(`  ${title}`);
	console.log("=".repeat(60));
}

async function cleanup(): Promise<void> {
	try {
		if (existsSync(CACHE_PATH)) unlinkSync(CACHE_PATH);
	} catch {
		// Ignore
	}
}

async function runTests(): Promise<void> {
	console.log("\n🧪 Spotifyd Installer Test Suite\n");

	const installer = getSpotifydInstaller();

	// Test 1: Fast Path (with cache)
	section("Test 1: Fast Path Verification (with cache)");
	try {
		const startTime = Date.now();
		const result = await installer.verify();
		const duration = Date.now() - startTime;

		if (result.canProceed) {
			success(`Verification passed in ${duration}ms`);
			if (duration < 50 && existsSync(CACHE_PATH)) {
				success("Fast path used (cache hit)");
			} else {
				log(
					`Duration: ${duration}ms (acceptable, but slower than expected fast path)`,
				);
			}
		} else {
			fail(`Verification failed: ${result.error}`);
		}
	} catch (error) {
		fail(`Exception: ${error}`);
	}

	// Test 2: Cache Miss (delete cache, verify again)
	section("Test 2: Cache Miss Verification");
	try {
		await cleanup();

		const startTime = Date.now();
		const result = await installer.verify();
		const duration = Date.now() - startTime;

		if (result.canProceed) {
			success(`Verification passed in ${duration}ms`);
			if (existsSync(CACHE_PATH)) {
				success("Cache recreated");
			} else {
				fail("Cache was not recreated");
			}
		} else {
			fail(`Verification failed: ${result.error}`);
		}
	} catch (error) {
		fail(`Exception: ${error}`);
	}

	// Test 3: Permission Repair
	section("Test 3: Permission Repair");
	try {
		await cleanup();

		if (existsSync(BINARY_PATH)) {
			// Remove execute permission
			chmodSync(BINARY_PATH, 0o644);
			log("Removed execute permission");

			const verification = await installer.verify();

			if (verification.state === "no_permissions" && verification.needsRepair) {
				success("Correctly detected missing permissions");

				// Attempt repair
				const repairResult = await installer.repair(verification);

				if (repairResult.success) {
					success("Permission repair succeeded");

					// Verify repair worked
					const finalVerification = await installer.verify();
					if (finalVerification.canProceed) {
						success("Binary is now executable and verified");
					} else {
						fail("Binary still not verified after repair");
					}
				} else {
					fail(`Repair failed: ${repairResult.message}`);
				}
			} else {
				fail(
					`Did not detect permission issue correctly. State: ${verification.state}`,
				);
			}
		} else {
			log("⚠️  Binary doesn't exist, skipping permission test");
		}
	} catch (error) {
		fail(`Exception: ${error}`);
	}

	// Test 4: Corrupted Binary Repair
	section("Test 4: Corrupted Binary Detection & Repair");
	try {
		await cleanup();

		if (existsSync(BINARY_PATH)) {
			// Save original binary
			const originalPath = `${BINARY_PATH}.backup`;
			await Bun.write(originalPath, await Bun.file(BINARY_PATH).text());

			// Corrupt the binary
			writeFileSync(BINARY_PATH, "garbage content", "utf-8");
			log("Corrupted binary");

			const verification = await installer.verify();

			if (verification.state === "corrupted" && verification.needsRepair) {
				success("Correctly detected corrupted binary");

				// Attempt repair
				const repairResult = await installer.repair(verification);

				if (repairResult.success) {
					success("Corruption repair succeeded (reinstalled)");

					// Verify repair worked
					const finalVerification = await installer.verify();
					if (finalVerification.canProceed) {
						success("Binary is now valid and verified");
					} else {
						fail("Binary still not verified after repair");
					}
				} else {
					// Restore original binary if repair failed
					await Bun.write(BINARY_PATH, await Bun.file(originalPath).text());
					unlinkSync(originalPath);
					fail(`Repair failed: ${repairResult.message}`);
				}
			} else {
				// Restore original binary
				await Bun.write(BINARY_PATH, await Bun.file(originalPath).text());
				unlinkSync(originalPath);
				fail(
					`Did not detect corruption correctly. State: ${verification.state}`,
				);
			}

			// Cleanup backup
			if (existsSync(originalPath)) {
				unlinkSync(originalPath);
			}
		} else {
			log("⚠️  Binary doesn't exist, skipping corruption test");
		}
	} catch (error) {
		fail(`Exception: ${error}`);
	}

	// Test 5: State Machine
	section("Test 5: State Machine");
	try {
		const state = installer.getState();

		if (state.state && state.binaryPath) {
			success(`State: ${state.state}`);
			success(`Binary path: ${state.binaryPath}`);
			if (state.version) {
				success(`Version: ${state.version}`);
			}
		} else {
			fail("State machine incomplete");
		}
	} catch (error) {
		fail(`Exception: ${error}`);
	}

	// Test 6: Custom Path Validation
	section("Test 6: Custom Path Environment Variable");
	try {
		// Set custom path to the managed binary (should work)
		process.env.SPOTIFY_TUI_SPOTIFYD_PATH = BINARY_PATH;

		const result = await installer.verify();

		if (result.canProceed) {
			success("Custom path validation passed");
		} else {
			fail(`Custom path validation failed: ${result.error}`);
		}

		// Cleanup
		delete process.env.SPOTIFY_TUI_SPOTIFYD_PATH;
	} catch (error) {
		fail(`Exception: ${error}`);
	}

	// Final Report
	section("Test Results");
	console.log(`  Tests Passed: ${testsPassed}`);
	console.log(`  Tests Failed: ${testsFailed}`);
	console.log(`  Total Tests:  ${testsPassed + testsFailed}`);

	if (testsFailed === 0) {
		console.log("\n  🎉 All tests passed!\n");
		process.exit(0);
	} else {
		console.log("\n  ⚠️  Some tests failed. Review output above.\n");
		process.exit(1);
	}
}

// Run tests
runTests().catch((error) => {
	console.error(`\n❌ Test suite failed: ${error}\n`);
	process.exit(1);
});
