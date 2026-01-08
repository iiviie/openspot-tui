import { mkdirSync, existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { StoredCredentials } from "../types/spotify";

/**
 * Configuration and credentials storage service
 * Manages ~/.config/spotify-tui/ directory
 */
export class ConfigService {
  private configDir: string;
  private credentialsPath: string;
  private configPath: string;

  constructor() {
    // Use XDG_CONFIG_HOME if available, otherwise ~/.config
    const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
    this.configDir = join(configHome, "spotify-tui");
    this.credentialsPath = join(this.configDir, "credentials.json");
    this.configPath = join(this.configDir, "config.json");

    this.ensureConfigDir();
  }

  /**
   * Ensure the config directory exists
   */
  private ensureConfigDir(): void {
    if (!existsSync(this.configDir)) {
      mkdirSync(this.configDir, { recursive: true, mode: 0o700 });
    }
  }

  /**
   * Get the config directory path
   */
  getConfigDir(): string {
    return this.configDir;
  }

  /**
   * Store credentials securely
   */
  saveCredentials(credentials: StoredCredentials): void {
    const data = JSON.stringify(credentials, null, 2);
    writeFileSync(this.credentialsPath, data, { mode: 0o600 });
  }

  /**
   * Load stored credentials
   * Returns null if no credentials exist or they're invalid
   */
  loadCredentials(): StoredCredentials | null {
    if (!existsSync(this.credentialsPath)) {
      return null;
    }

    try {
      const data = readFileSync(this.credentialsPath, "utf-8");
      const credentials = JSON.parse(data) as StoredCredentials;

      // Validate required fields
      if (!credentials.access_token || !credentials.refresh_token || !credentials.expires_at) {
        return null;
      }

      return credentials;
    } catch {
      return null;
    }
  }

  /**
   * Check if credentials exist and are not expired
   * Includes a 5-minute buffer before expiration
   */
  hasValidCredentials(): boolean {
    const credentials = this.loadCredentials();
    if (!credentials) {
      return false;
    }

    const bufferMs = 5 * 60 * 1000; // 5 minutes
    const now = Date.now();
    return credentials.expires_at > now + bufferMs;
  }

  /**
   * Check if credentials exist (may be expired but refreshable)
   */
  hasCredentials(): boolean {
    const credentials = this.loadCredentials();
    return credentials !== null && !!credentials.refresh_token;
  }

  /**
   * Delete stored credentials (logout)
   */
  clearCredentials(): void {
    if (existsSync(this.credentialsPath)) {
      writeFileSync(this.credentialsPath, "", { mode: 0o600 });
      // Could also use unlinkSync to delete the file
    }
  }

  /**
   * Get the access token if valid
   */
  getAccessToken(): string | null {
    const credentials = this.loadCredentials();
    if (!credentials) {
      return null;
    }

    // Check if expired (with 5 min buffer)
    const bufferMs = 5 * 60 * 1000;
    if (credentials.expires_at <= Date.now() + bufferMs) {
      return null; // Token expired, needs refresh
    }

    return credentials.access_token;
  }

  /**
   * Get the refresh token
   */
  getRefreshToken(): string | null {
    const credentials = this.loadCredentials();
    return credentials?.refresh_token ?? null;
  }

  /**
   * Save general configuration
   */
  saveConfig(config: Record<string, unknown>): void {
    const existing = this.loadConfig();
    const merged = { ...existing, ...config };
    const data = JSON.stringify(merged, null, 2);
    writeFileSync(this.configPath, data, { mode: 0o600 });
  }

  /**
   * Load general configuration
   */
  loadConfig(): Record<string, unknown> {
    if (!existsSync(this.configPath)) {
      return {};
    }

    try {
      const data = readFileSync(this.configPath, "utf-8");
      return JSON.parse(data);
    } catch {
      return {};
    }
  }

  /**
   * Get a specific config value
   */
  getConfigValue<T>(key: string, defaultValue: T): T {
    const config = this.loadConfig();
    return (config[key] as T) ?? defaultValue;
  }
}

// Singleton instance
let configServiceInstance: ConfigService | null = null;

export function getConfigService(): ConfigService {
  if (!configServiceInstance) {
    configServiceInstance = new ConfigService();
  }
  return configServiceInstance;
}
