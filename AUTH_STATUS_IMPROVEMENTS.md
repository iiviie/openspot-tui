# Authentication & Status Improvements Plan

> Implementation plan for fixing authentication flows, status indicators, and cache invalidation.

---

## Current Issues Summary

1. **No Web API login option in command palette** - only spotifyd auth exists
2. **spotifyd auth flow is buggy** - shows "Disconnected" after successful browser login
3. **Status indicators are misleading** - says "Running" while spotifyd is still booting
4. **Cache doesn't invalidate on logout** - songs still visible after deleting credentials

---

## Current File Locations

| Credential Type | Current Location |
|-----------------|------------------|
| Web API tokens | `~/.config/spotify-tui/credentials.json` |
| spotifyd tokens | `~/.cache/spotifyd/oauth/credentials.json` |
| Persistent cache | `~/.spotify-tui/cache/` |

---

## Implementation Tasks

### Task 1: Fix spotifyd Authentication Flow

**Problem**: After browser OAuth completes, TUI still shows "Disconnected" until random restart.

**Files to modify**:
- `src/services/SpotifydManager.ts`
- `src/app.ts` (lines 564-608, `authenticateSpotifyd()`)

**What needs to be done**:
1. After `spotifyd authenticate` completes, add a polling loop that waits for credentials file to appear at `~/.cache/spotifyd/oauth/credentials.json`
2. Add a reasonable timeout (30 seconds) for the polling
3. Once credentials file exists, trigger spotifyd restart
4. Wait for spotifyd process to be fully running (not just spawned) before attempting MPRIS reconnect
5. Add explicit delay (2-3 seconds) between spotifyd start and MPRIS connection attempt
6. Force a status update immediately after reconnection attempt

**Root cause investigation needed**:
- Check if `spotifyd authenticate` returns before credentials are actually written
- Check if MPRIS connection is attempted before spotifyd fully initializes

---

### Task 2: Improve Status Indicators

**Problem**: Status shows "Running" immediately when spotifyd is still starting up. Indicators don't provide granular state.

**Files to modify**:
- `src/components/StatusSidebar.ts` (lines 180-216)
- `src/services/SpotifydManager.ts` (add startup state tracking)
- `src/app.ts` (lines 641-656, `updateConnectionStatus()`)
- `src/types/` (add new status types if needed)

**What needs to be done**:

#### spotifyd Status States (replace binary Running/Stopped):
| State | When |
|-------|------|
| `Not Installed` | Binary not found |
| `Not Authenticated` | No credentials file |
| `Starting...` | Process spawned but not fully ready |
| `Running` | Process running AND responding |
| `Stopping...` | Shutdown initiated |
| `Stopped` | Not running |
| `Error: <msg>` | Crash or failure |

#### MPRIS Status States:
| State | When |
|-------|------|
| `Connecting...` | D-Bus connection in progress |
| `Connected` | Successfully connected |
| `Disconnected` | Not connected |
| `Reconnecting...` | Lost connection, attempting recovery |

#### Implementation Details:
1. Add `SpotifydState` enum/type with above states
2. Track startup state in `SpotifydManager` - set "Starting..." on spawn, check process responsiveness before marking "Running"
3. Add health check method that pings spotifyd (via MPRIS or process signal) to verify it's actually responsive
4. Update `StatusSidebar` to display granular states
5. During auth flow, show "Authenticating..." state

---

### Task 3: Add Web API Login to Command Palette

**Problem**: No way to trigger Web API authentication from TUI.

**Files to modify**:
- `src/app.ts` (lines 426-558, `buildCommands()`)
- `src/services/AuthService.ts`

**What needs to be done**:

1. Add new command to `buildCommands()`:
   ```
   {
     id: "api-authenticate",
     label: "Login to Spotify",
     category: "Account",
     action: async () => { ... }
   }
   ```

2. Add "Logout" command:
   ```
   {
     id: "api-logout", 
     label: "Logout",
     category: "Account",
     action: async () => { ... }
   }
   ```

3. Implementation for login action:
   - Call `authService.startAuthFlow()`
   - Show status "Waiting for login..." in status bar
   - On success, reload library data
   - On failure, show error message

4. Implementation for logout action:
   - Clear credentials file
   - Clear ALL caches (see Task 4)
   - Clear UI state (library, playlists, etc.)
   - Show logged-out state in UI

5. Consider adding "Switch Account" command that does logout + login in sequence

---

### Task 4: Fix Cache Invalidation on Logout

**Problem**: After deleting credentials, cached songs still display because caches aren't cleared.

**Files to modify**:
- `src/services/CacheService.ts`
- `src/services/PersistentCacheService.ts`
- `src/services/AuthService.ts` or new logout handling code
- `src/app.ts`

**What needs to be done**:

1. Add `clearAllCaches()` method to `PersistentCacheService`:
   - Delete all files in `~/.spotify-tui/cache/` directory
   - Reset any in-memory state

2. Create logout sequence that clears:
   - In-memory cache (`CacheService.clear()`)
   - Persistent disk cache (`PersistentCacheService.clearAllCaches()`)
   - Credentials file
   - Reset UI components to empty/logged-out state

3. On app startup, verify credentials exist before loading from cache:
   - If no valid credentials, skip cache loading
   - Clear stale cache if credentials are missing

4. Add cache validation:
   - Store a hash/identifier of the logged-in user in cache
   - On startup, compare cached user with current user
   - If different user, invalidate all caches (account switch scenario)

---



### Task 5: Improve Auth Flow UX

**Files to modify**:
- `src/components/StatusSidebar.ts`
- `src/app.ts`
- Potentially add a new modal/overlay component

**What needs to be done**:

1. During any auth flow, show clear status:
   - "Opening browser..."
   - "Waiting for login..."
   - "Authenticating..."
   - "Success!" / "Failed: <reason>"

2. Add timeout handling:
   - If auth takes > 5 minutes, show timeout message
   - Allow user to retry or cancel

3. Show which auth is missing on startup:
   - If Web API not authenticated: prompt to login
   - If spotifyd not authenticated: prompt to authenticate spotifyd
   - Guide user through both if needed

4. Consider a "Setup Wizard" for first-time users:
   - Step 1: Web API login
   - Step 2: spotifyd authentication
   - Step 3: Verify both connections

---

## Implementation Order

| Priority | Task | Estimated Complexity |
|----------|------|---------------------|
| 1 | Task 4: Fix Cache Invalidation | Medium |
| 2 | Task 3: Add Web API Login Command | Low |
| 3 | Task 1: Fix spotifyd Auth Flow | Medium-High |
| 4 | Task 2: Improve Status Indicators | Medium |
| 5 | Task 6: Improve Auth Flow UX | Medium |
| 6 | Task 5: Unify Credential Storage | Low |

**Rationale**: 
- Cache invalidation is critical - users see stale data from wrong accounts
- Web API login is low-hanging fruit - simple command addition
- spotifyd auth fix requires investigation into timing issues
- Status indicators build on the auth fix
- UX improvements are polish after core fixes
- Credential unification is nice-to-have

---

## Testing Scenarios

After implementation, verify:

1. **Fresh install flow**:
   - Delete both credential files
   - Start TUI
   - Should show "Not logged in" state, empty library
   - Use command palette to login to Web API
   - Use command palette to authenticate spotifyd
   - Both should complete and status should update correctly

2. **Logout flow**:
   - With active session, use Logout command
   - Library should clear immediately
   - Status should show logged out
   - Restart TUI - should still be logged out, no cached data

3. **spotifyd auth timing**:
   - Authenticate spotifyd via command palette
   - Status should show "Authenticating..." during browser flow
   - After browser success, status should transition through "Starting..." to "Running"
   - MPRIS should connect without manual restart

4. **Cache invalidation**:
   - Login as User A, load library
   - Logout
   - Login as User B
   - Should see User B's library, not cached User A data

---

## Potential Blockers & Fixes

### Blocker 1: spotifyd Auth Completion Detection

**Problem**: We don't know exactly when `spotifyd authenticate` finishes. Does it:
- Exit after auth completes?
- Output a success message?
- Write credentials before or after exiting?

**Fix Approach**:
1. First, investigate manually: run `spotifyd authenticate` and observe behavior
2. If it exits on completion: wait for process exit, then poll for credentials file
3. If it keeps running: poll for credentials file appearance (check every 500ms)
4. Add 30-second timeout - if no credentials file appears, show error
5. Parse stdout for any success/failure messages as secondary signal

**Not a blocker** - polling for credentials file will work regardless of process behavior.

---

### Blocker 2: MPRIS Connection Race Condition

**Problem**: Current flow attempts MPRIS connection immediately after spawning spotifyd. D-Bus registration takes time.

**Current behavior**:
```
spotifyd spawn → immediate MPRIS connect → fail → "Disconnected"
```

**Fix Approach**:
1. Add retry loop with exponential backoff for MPRIS connection:
   ```
   Attempt 1: wait 500ms
   Attempt 2: wait 1000ms  
   Attempt 3: wait 2000ms
   Attempt 4: wait 3000ms
   Max attempts: 5 (total ~10 seconds)
   ```
2. During retries, show "Connecting..." status
3. Only show "Disconnected" after all retries exhausted
4. Alternative: add health check that verifies spotifyd responds on D-Bus before marking "Running"

**Not a blocker** - retry logic is straightforward to implement.

---

### Blocker 3: Startup Cache vs Credentials Order

**Problem**: App loads cache before validating credentials, showing stale data.

**Current flow**:
```
App start → Load persistent cache → Display songs → Check credentials (too late)
```

**Fix Approach**:
1. Change startup order:
   ```
   App start → Check credentials → If valid: load cache → If invalid: clear cache, show login
   ```
2. In `app.ts`, move credential check before `loadSavedTracks()`
3. Add early bail-out if no valid credentials

**Not a blocker** - just reordering initialization logic.

---

### Blocker 4: External Credential Deletion (Edge Case)

**Problem**: If user deletes credentials file while app is running (`rm ~/.config/spotify-tui/credentials.json`), app doesn't notice.

**Fix Approach**:
1. **Option A (Simple)**: Accept this edge case - user should restart app after manual file deletion
2. **Option B (Robust)**: Add periodic credential file existence check (every 30 seconds)
3. **Option C (Reactive)**: Use file system watcher (`fs.watch`) on credentials file

**Recommendation**: Option A for now. Document that manual credential deletion requires app restart. Can add Option B/C later if users complain.

**Not a blocker** - edge case with acceptable workaround.

---

### Blocker 5: Two OAuth Flows Confusion

**Problem**: Users need to authenticate twice (Web API + spotifyd) and may not understand why.

**Fix Approach**:
1. Add clear labeling in command palette:
   - "Login to Spotify" → for library/playlists (Web API)
   - "Authenticate Spotifyd" → for audio playback
2. On first launch, show explanation or guide user through both
3. Status sidebar should clearly indicate which auth is missing

**Not a blocker** - UX improvement, not technical limitation.

---

## Summary: Are These Blockers?

| Issue | Blocker? | Fix Complexity |
|-------|----------|----------------|
| spotifyd auth completion detection | No | Low (poll for file) |
| MPRIS race condition | No | Low (retry loop) |
| Startup cache order | No | Low (reorder init) |
| External credential deletion | No | N/A (edge case) |
| Two OAuth flows confusion | No | Low (UX labels) |

**None are true blockers.** All have straightforward fixes.

---

## Notes

- spotifyd stores its credentials in a location we cannot control (`~/.cache/spotifyd/oauth/`)
- The 1-second polling interval for status updates is probably fine, but we should ensure state transitions are immediate for auth flows
- Consider debouncing rapid status changes to avoid UI flicker
