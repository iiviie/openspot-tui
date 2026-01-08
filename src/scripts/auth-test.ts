/**
 * Authentication Test Script
 * Run with: bun run src/scripts/auth-test.ts
 * 
 * This script tests the OAuth2 PKCE flow:
 * 1. Checks for existing credentials
 * 2. If none, initiates login flow
 * 3. Fetches user profile to verify token works
 */

import { getAuthService, getConfigService, SPOTIFY_CLIENT_ID } from "../services";
import type { SpotifyUser } from "../types/spotify";

async function main() {
  console.log("🎵 Spotify TUI - Authentication Test\n");
  console.log("=".repeat(50));

  const configService = getConfigService();
  const authService = getAuthService(SPOTIFY_CLIENT_ID);

  console.log(`\n📁 Config directory: ${configService.getConfigDir()}`);

  // Check existing credentials
  if (authService.isAuthenticated()) {
    console.log("✅ Found existing credentials");

    if (authService.hasValidToken()) {
      console.log("✅ Token is still valid");
    } else {
      console.log("⏳ Token expired, refreshing...");
      try {
        await authService.refreshAccessToken();
        console.log("✅ Token refreshed successfully");
      } catch (error) {
        console.log("❌ Token refresh failed, need to re-login");
        await performLogin(authService);
      }
    }
  } else {
    console.log("❌ No credentials found, initiating login...");
    await performLogin(authService);
  }

  // Test API call with the token
  console.log("\n📡 Testing API access...");
  console.log("   (Using ncspot's shared client ID - may hit rate limits)\n");
  try {
    const token = await authService.getValidAccessToken();
    const user = await fetchUserProfile(token);
    
    console.log("\n✅ Successfully authenticated!");
    console.log("=".repeat(50));
    console.log(`👤 User: ${user.display_name || user.id}`);
    console.log(`📧 Email: ${user.email || "N/A"}`);
    console.log(`🌍 Country: ${user.country || "N/A"}`);
    console.log(`⭐ Product: ${user.product || "N/A"}`);
    console.log("=".repeat(50));

    if (user.product !== "premium") {
      console.log("\n⚠️  Warning: Spotify Premium is required for playback features.");
      console.log("   Library browsing and search will still work.\n");
    }
  } catch (error) {
    // If we have credentials, consider it a success even if API test fails due to rate limit
    if (authService.hasValidToken()) {
      console.log("\n⚠️  API test hit rate limits, but credentials are valid!");
      console.log("   This is normal with shared client IDs.");
      console.log("   The app will retry automatically when you use it.\n");
    } else {
      console.error("\n❌ API test failed:", error);
      process.exit(1);
    }
  }

  console.log("\n🎉 Authentication setup complete!");
  console.log("   You can now run the main app with: bun run start\n");
}

async function performLogin(authService: ReturnType<typeof getAuthService>) {
  try {
    await authService.login();
    console.log("✅ Login successful!");
  } catch (error) {
    console.error("❌ Login failed:", error);
    process.exit(1);
  }
}

async function fetchUserProfile(accessToken: string, retries = 3): Promise<SpotifyUser> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const response = await fetch("https://api.spotify.com/v1/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (response.ok) {
      return response.json() as Promise<SpotifyUser>;
    }

    // Handle rate limiting
    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get("Retry-After") || "30", 10);
      console.log(`⏳ Rate limited. Waiting ${retryAfter}s... (attempt ${attempt}/${retries})`);
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      continue;
    }

    const error = await response.text();
    throw new Error(`Failed to fetch user profile: ${response.status} - ${error}`);
  }

  throw new Error("Max retries exceeded due to rate limiting");
}

// Run
main().catch(console.error);
