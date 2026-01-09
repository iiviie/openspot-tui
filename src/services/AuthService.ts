import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { URL } from "node:url";
import {
	AUTH_TIMEOUT_MS,
	DEFAULT_CALLBACK_PORT,
	PKCE_VERIFIER_BYTES,
	PKCE_VERIFIER_LENGTH,
} from "../config/constants";
import type {
	AuthConfig,
	PKCEChallenge,
	SpotifyTokens,
	StoredCredentials,
} from "../types/spotify";
import { type ConfigService, getConfigService } from "./ConfigService";

/**
 * Spotify OAuth2 Authentication Service
 * Implements Authorization Code with PKCE flow
 */
export class AuthService {
	private config: AuthConfig;
	private configService: ConfigService;
	private server: Server | null = null;
	private pendingChallenge: PKCEChallenge | null = null;

	// Spotify OAuth endpoints
	private static readonly AUTH_URL = "https://accounts.spotify.com/authorize";
	private static readonly TOKEN_URL = "https://accounts.spotify.com/api/token";

	// Required scopes for our app
	private static readonly DEFAULT_SCOPES = [
		// Playback
		"streaming",
		"user-modify-playback-state",
		"user-read-playback-state",
		"user-read-currently-playing",
		// Library
		"user-library-read",
		"user-library-modify",
		// Playlists
		"playlist-read-private",
		"playlist-read-collaborative",
		"playlist-modify-public",
		"playlist-modify-private",
		// User
		"user-read-private",
		"user-read-email",
		"user-top-read",
		"user-read-recently-played",
		// Follow
		"user-follow-read",
		"user-follow-modify",
	];

	constructor(
		clientId: string,
		redirectUri: string = `http://127.0.0.1:${DEFAULT_CALLBACK_PORT}/callback`,
	) {
		this.config = {
			clientId,
			redirectUri,
			scopes: AuthService.DEFAULT_SCOPES,
		};
		this.configService = getConfigService();
	}

	/**
	 * Generate PKCE code verifier and challenge
	 */
	private generatePKCE(): PKCEChallenge {
		// Generate random code verifier (43-128 characters per OAuth 2.0 spec)
		const codeVerifier = randomBytes(PKCE_VERIFIER_BYTES)
			.toString("base64")
			.replace(/\+/g, "-")
			.replace(/\//g, "_")
			.replace(/=/g, "")
			.substring(0, PKCE_VERIFIER_LENGTH);

		// Generate code challenge (SHA256 hash of verifier, base64url encoded)
		const hash = createHash("sha256").update(codeVerifier).digest("base64");
		const codeChallenge = hash
			.replace(/\+/g, "-")
			.replace(/\//g, "_")
			.replace(/=/g, "");

		return { codeVerifier, codeChallenge };
	}

	/**
	 * Build the authorization URL
	 */
	private buildAuthUrl(codeChallenge: string, state: string): string {
		const params = new URLSearchParams({
			client_id: this.config.clientId,
			response_type: "code",
			redirect_uri: this.config.redirectUri,
			code_challenge_method: "S256",
			code_challenge: codeChallenge,
			state: state,
			scope: this.config.scopes.join(" "),
		});

		return `${AuthService.AUTH_URL}?${params.toString()}`;
	}

	/**
	 * Exchange authorization code for tokens
	 */
	private async exchangeCodeForTokens(
		code: string,
		codeVerifier: string,
	): Promise<SpotifyTokens> {
		const body = new URLSearchParams({
			client_id: this.config.clientId,
			grant_type: "authorization_code",
			code: code,
			redirect_uri: this.config.redirectUri,
			code_verifier: codeVerifier,
		});

		const response = await fetch(AuthService.TOKEN_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: body.toString(),
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Token exchange failed: ${response.status} - ${error}`);
		}

		return response.json() as Promise<SpotifyTokens>;
	}

	/**
	 * Refresh an expired access token
	 */
	async refreshAccessToken(refreshToken?: string): Promise<StoredCredentials> {
		const token = refreshToken ?? this.configService.getRefreshToken();
		if (!token) {
			throw new Error("No refresh token available");
		}

		const body = new URLSearchParams({
			client_id: this.config.clientId,
			grant_type: "refresh_token",
			refresh_token: token,
		});

		const response = await fetch(AuthService.TOKEN_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: body.toString(),
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Token refresh failed: ${response.status} - ${error}`);
		}

		const tokens = (await response.json()) as SpotifyTokens;

		// Build stored credentials
		const credentials: StoredCredentials = {
			access_token: tokens.access_token,
			refresh_token: tokens.refresh_token ?? token, // Keep old refresh token if not returned
			expires_at: Date.now() + tokens.expires_in * 1000,
			scope: tokens.scope,
		};

		// Save to disk
		this.configService.saveCredentials(credentials);

		return credentials;
	}

	/**
	 * Start the OAuth2 login flow
	 * Opens browser and waits for callback
	 */
	async login(): Promise<StoredCredentials> {
		return new Promise((resolve, reject) => {
			// Generate PKCE challenge
			this.pendingChallenge = this.generatePKCE();
			const state = randomBytes(16).toString("hex");

			// Parse redirect URI to get port
			const redirectUrl = new URL(this.config.redirectUri);
			const port = parseInt(redirectUrl.port, 10) || 8888;
			const callbackPath = redirectUrl.pathname;

			// Create local server to receive callback
			this.server = createServer(async (req, res) => {
				const url = new URL(req.url ?? "/", `http://localhost:${port}`);

				if (url.pathname === callbackPath) {
					const code = url.searchParams.get("code");
					const returnedState = url.searchParams.get("state");
					const error = url.searchParams.get("error");

					// Send response to browser
					res.writeHead(200, { "Content-Type": "text/html" });

					if (error) {
						res.end(this.getErrorHtml(error));
						this.cleanup();
						reject(new Error(`Authorization denied: ${error}`));
						return;
					}

					if (returnedState !== state) {
						res.end(this.getErrorHtml("State mismatch - possible CSRF attack"));
						this.cleanup();
						reject(new Error("State mismatch"));
						return;
					}

					if (!code) {
						res.end(this.getErrorHtml("No authorization code received"));
						this.cleanup();
						reject(new Error("No authorization code"));
						return;
					}

					try {
						// Exchange code for tokens
						const tokens = await this.exchangeCodeForTokens(
							code,
							this.pendingChallenge?.codeVerifier ?? "",
						);

						// Build stored credentials
						const credentials: StoredCredentials = {
							access_token: tokens.access_token,
							refresh_token: tokens.refresh_token,
							expires_at: Date.now() + tokens.expires_in * 1000,
							scope: tokens.scope,
						};

						// Save to disk
						this.configService.saveCredentials(credentials);

						res.end(this.getSuccessHtml());
						this.cleanup();
						resolve(credentials);
					} catch (err) {
						res.end(this.getErrorHtml(String(err)));
						this.cleanup();
						reject(err);
					}
				} else {
					res.writeHead(404);
					res.end("Not found");
				}
			});

			this.server.listen(port, async () => {
				const authUrl = this.buildAuthUrl(
					this.pendingChallenge?.codeChallenge ?? "",
					state,
				);

				console.log("\n🎵 Spotify Authentication Required\n");
				console.log("Opening your browser to login with Spotify...\n");
				console.log("If the browser doesn't open, visit this URL:\n");
				console.log(authUrl);
				console.log("\nWaiting for authentication...\n");

				// Try to open browser
				try {
					const open = await import("open");
					await open.default(authUrl);
				} catch {
					// open package not available, user needs to manually open URL
					console.log(
						"(Could not open browser automatically - please open the URL above)",
					);
				}
			});

			this.server.on("error", (err) => {
				this.cleanup();
				reject(new Error(`Failed to start callback server: ${err.message}`));
			});

			// Timeout for authentication
			setTimeout(() => {
				if (this.server) {
					this.cleanup();
					reject(new Error("Authentication timed out"));
				}
			}, AUTH_TIMEOUT_MS);
		});
	}

	/**
	 * Get a valid access token, refreshing if necessary
	 */
	async getValidAccessToken(): Promise<string> {
		// Check if we have a valid token
		const token = this.configService.getAccessToken();
		if (token) {
			return token;
		}

		// Try to refresh
		if (this.configService.hasCredentials()) {
			const credentials = await this.refreshAccessToken();
			return credentials.access_token;
		}

		// Need to login
		throw new Error("Not authenticated. Please login first.");
	}

	/**
	 * Check if user is authenticated (has valid or refreshable credentials)
	 */
	isAuthenticated(): boolean {
		return this.configService.hasCredentials();
	}

	/**
	 * Check if current token is valid (not expired)
	 */
	hasValidToken(): boolean {
		return this.configService.hasValidCredentials();
	}

	/**
	 * Logout - clear stored credentials
	 */
	logout(): void {
		this.configService.clearCredentials();
	}

	/**
	 * Cleanup server and pending state
	 */
	private cleanup(): void {
		if (this.server) {
			this.server.close();
			this.server = null;
		}
		this.pendingChallenge = null;
	}

	/**
	 * Success HTML page
	 */
	private getSuccessHtml(): string {
		return `
<!DOCTYPE html>
<html>
<head>
  <title>spotify-tui - Authentication Successful</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #fff;
    }
    .container {
      text-align: center;
      padding: 40px;
      background: rgba(255,255,255,0.1);
      border-radius: 16px;
      backdrop-filter: blur(10px);
    }
    h1 { color: #1DB954; margin-bottom: 16px; }
    p { color: #b3b3b3; }
    .icon { font-size: 64px; margin-bottom: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">✓</div>
    <h1>Authentication Successful!</h1>
    <p>You can close this window and return to spotify-tui.</p>
  </div>
</body>
</html>`;
	}

	/**
	 * Error HTML page
	 */
	private getErrorHtml(error: string): string {
		// Escape HTML to prevent XSS
		const escapedError = error
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#39;");

		return `
<!DOCTYPE html>
<html>
<head>
  <title>spotify-tui - Authentication Failed</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #fff;
    }
    .container {
      text-align: center;
      padding: 40px;
      background: rgba(255,255,255,0.1);
      border-radius: 16px;
      backdrop-filter: blur(10px);
    }
    h1 { color: #e74c3c; margin-bottom: 16px; }
    p { color: #b3b3b3; }
    .error { color: #ff6b6b; font-family: monospace; margin-top: 16px; }
    .icon { font-size: 64px; margin-bottom: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">✗</div>
    <h1>Authentication Failed</h1>
    <p>Something went wrong during authentication.</p>
    <p class="error">${escapedError}</p>
    <p>Please close this window and try again.</p>
  </div>
</body>
</html>`;
	}
}

// Singleton instance
let authServiceInstance: AuthService | null = null;

/**
 * Get or create the AuthService singleton
 * @param clientId - Spotify Client ID (required on first call)
 */
export function getAuthService(clientId?: string): AuthService {
	if (!authServiceInstance) {
		if (!clientId) {
			throw new Error("Client ID required to initialize AuthService");
		}
		authServiceInstance = new AuthService(clientId);
	}
	return authServiceInstance;
}

// Our own Spotify Client ID (personal app)
// This avoids rate limit issues from shared ncspot client ID
export const SPOTIFY_CLIENT_ID = "fd10bd82d78e41fa8ee0e6b041650261";
