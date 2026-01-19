# 004: Production-Grade Logging System

**Created:** 2026-01-20  
**Status:** Planning  
**Priority:** Medium

---

## Problem Statement

The current logging system has several limitations:

1. **No persistence for TypeScript logs** - All TS logs go to console only, lost after app closes
2. **No log rotation** - Rust logs truncate on each run (loses history), no size management
3. **No unified log location** - Rust logs to file, TypeScript logs to console
4. **No structured logging** - Hard to parse logs programmatically
5. **Performance concerns** - Synchronous console.log can block event loop

---

## Current State Analysis

### TypeScript Logger (`src/utils/Logger.ts`)

| Feature | Status |
|---------|--------|
| Log Levels | ✅ DEBUG, INFO, WARN, ERROR, NONE |
| Timestamps | ✅ HH:mm:ss.SSS format |
| Context (child loggers) | ✅ Supported |
| Color support | ✅ ANSI codes |
| File persistence | ❌ None |
| Log rotation | ❌ None |
| Async logging | ❌ Synchronous |
| Structured output | ❌ Plain text only |

### Rust Native Module (`mpris-native/`)

| Feature | Status |
|---------|--------|
| Log Levels | ✅ via RUST_LOG env |
| File output | ✅ `~/.spotify-tui/logs/mpris-native.log` |
| Rotation | ❌ Truncates each run |
| tracing spans | ✅ Via `#[instrument]` |

---

## Requirements

### Functional Requirements

1. **Log Persistence** - All logs (TS + Rust) stored to disk
2. **Log Rotation** - Prevent unbounded log growth
   - Size-based rotation (e.g., max 5MB per file)
   - Keep N recent files (e.g., last 5 rotations)
3. **Unified Location** - All logs in `~/.spotify-tui/logs/`
4. **Structured Logging** - JSON format for machine parsing (optional)
5. **Log Levels** - Configurable via environment or config file
6. **Context Preservation** - Maintain child logger contexts

### Non-Functional Requirements

1. **Performance** - Async/buffered writes, no blocking main thread
2. **Low Overhead** - Minimal memory footprint
3. **No Dependencies** (preferred) - Use Bun's native APIs if possible
4. **Graceful Degradation** - If logging fails, don't crash the app

---

## Design Options

### Option 1: Bun-Native File Logger (Recommended)

Use Bun's built-in `Bun.file()` and `Bun.write()` for async file operations.

**Pros:**
- No external dependencies
- Native Bun performance
- Full control over rotation logic

**Cons:**
- Need to implement rotation manually
- More code to maintain

**Architecture:**
```
┌─────────────────────────────────────────────────────────────┐
│                     LogManager (singleton)                   │
├─────────────────────────────────────────────────────────────┤
│  - Manages log file handles                                  │
│  - Implements rotation logic                                 │
│  - Buffers writes for performance                           │
│  - Flushes on interval or app exit                          │
└─────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│                     Logger (existing)                        │
├─────────────────────────────────────────────────────────────┤
│  - Formats messages                                          │
│  - Checks log levels                                         │
│  - Calls LogManager.write()                                  │
│  - Optionally also writes to console                         │
└─────────────────────────────────────────────────────────────┘
```

### Option 2: pino Logger

Use [pino](https://github.com/pinojs/pino), a fast JSON logger.

**Pros:**
- Battle-tested, high performance
- Built-in async mode
- Rich ecosystem (pino-pretty for dev, pino-roll for rotation)

**Cons:**
- External dependency (~100KB)
- JSON-only output (need pino-pretty for human-readable)
- May have compatibility issues with Bun

### Option 3: winston Logger

Use [winston](https://github.com/winstonjs/winston).

**Pros:**
- Most popular Node.js logger
- Multiple transports (file, console, etc.)
- Built-in rotation via winston-daily-rotate-file

**Cons:**
- Heavy dependency (~500KB with transports)
- Slower than pino
- May be overkill for TUI

---

## Recommended Approach: Option 1 (Bun-Native)

Given the project's focus on performance and minimal dependencies, a custom Bun-native implementation is recommended.

---

## Implementation Plan

### Phase 1: Core LogWriter

Create a new `LogWriter` class that handles file I/O:

```typescript
// src/utils/LogWriter.ts

interface LogWriterConfig {
  logDir: string;           // ~/.spotify-tui/logs
  maxFileSize: number;      // 5MB default
  maxFiles: number;         // 5 files default
  flushInterval: number;    // 1000ms default
  includeConsole: boolean;  // true for dev, false for prod
}

class LogWriter {
  private buffer: string[] = [];
  private currentFile: string;
  private currentSize: number = 0;
  
  constructor(config: LogWriterConfig) { ... }
  
  write(level: string, message: string): void {
    // Add to buffer
    // Trigger async flush if buffer full
  }
  
  private async flush(): Promise<void> {
    // Write buffer to file
    // Check rotation needed
  }
  
  private async rotate(): Promise<void> {
    // Rename current -> .1, .1 -> .2, etc.
    // Delete oldest if > maxFiles
  }
  
  async shutdown(): Promise<void> {
    // Flush remaining buffer
    // Close file handles
  }
}
```

### Phase 2: Integrate with Existing Logger

Modify `src/utils/Logger.ts` to use LogWriter:

```typescript
// Changes to Logger.ts

import { getLogWriter } from "./LogWriter";

class Logger {
  private logWriter = getLogWriter();
  
  private log(level: LogLevel, message: string, data?: unknown): void {
    if (this.config.level > level) return;
    
    const formatted = this.format(level, message, data);
    
    // Write to file (async, non-blocking)
    this.logWriter.write(LogLevel[level], formatted);
    
    // Optionally also console (for dev)
    if (this.config.includeConsole) {
      console[this.getConsoleMethod(level)](formatted);
    }
  }
}
```

### Phase 3: Rust Log Rotation

Update `mpris-native/src/lib.rs` to use `tracing-appender` for rotation:

```rust
// Cargo.toml addition
tracing-appender = "0.2"

// lib.rs changes
use tracing_appender::rolling::{RollingFileAppender, Rotation};

static INIT_TRACING: Lazy<()> = Lazy::new(|| {
    let log_dir = /* ... */;
    
    // Rolling file appender - rotates daily, keeps 7 days
    let file_appender = RollingFileAppender::builder()
        .rotation(Rotation::DAILY)
        .max_log_files(7)
        .filename_prefix("mpris-native")
        .filename_suffix("log")
        .build(log_dir)
        .expect("Failed to create log appender");
    
    // Non-blocking writer for async performance
    let (non_blocking, _guard) = tracing_appender::non_blocking(file_appender);
    
    tracing_subscriber::fmt()
        .with_env_filter(...)
        .with_writer(non_blocking)
        .init();
});
```

### Phase 4: Configuration

Add logging configuration to the app config:

```typescript
// src/config/logging.ts

export interface LoggingConfig {
  level: LogLevel;
  fileLogging: boolean;
  consoleLogging: boolean;
  maxFileSize: number;      // bytes
  maxFiles: number;
  logDir: string;
  format: "text" | "json";
}

export const DEFAULT_LOGGING_CONFIG: LoggingConfig = {
  level: LogLevel.INFO,
  fileLogging: true,
  consoleLogging: process.env.NODE_ENV === "development",
  maxFileSize: 5 * 1024 * 1024,  // 5MB
  maxFiles: 5,
  logDir: join(homedir(), ".spotify-tui", "logs"),
  format: "text",
};
```

### Phase 5: Graceful Shutdown

Ensure logs are flushed on app exit:

```typescript
// src/lifecycle/AppLifecycle.ts

async cleanup(): Promise<void> {
  // ... existing cleanup ...
  
  // Flush logs before exit
  await getLogWriter().shutdown();
}
```

---

## Log File Structure

```
~/.spotify-tui/
└── logs/
    ├── spotify-tui.log          # Current TypeScript log
    ├── spotify-tui.log.1        # Previous rotation
    ├── spotify-tui.log.2        # Older rotation
    ├── spotify-tui.log.3
    ├── spotify-tui.log.4
    ├── mpris-native.log         # Current Rust log
    ├── mpris-native.log.1       # Previous rotation
    └── ...
```

---

## Log Format

### Text Format (default)
```
2026-01-20 14:30:45.123 [INFO] [SpotifydService] Started spotifyd with PID 12345
2026-01-20 14:30:45.456 [WARN] [ConnectionManager] MPRIS connection retry 2/5
2026-01-20 14:30:45.789 [ERROR] [PlaybackController] Failed to play track: Device not found
```

### JSON Format (optional, for production/debugging)
```json
{"ts":"2026-01-20T14:30:45.123Z","level":"INFO","ctx":"SpotifydService","msg":"Started spotifyd","pid":12345}
{"ts":"2026-01-20T14:30:45.456Z","level":"WARN","ctx":"ConnectionManager","msg":"MPRIS connection retry","attempt":2,"max":5}
```

---

## Performance Considerations

### Buffered Writes

Instead of writing each log line to disk immediately:

```
Log message → Buffer (in memory) → Flush to disk (every 1s or buffer full)
```

This reduces disk I/O from hundreds of writes to a few per second.

### Async File Operations

```typescript
// Use Bun.write() which is async
await Bun.write(logFile, buffer.join("\n") + "\n");
```

### Log Level Short-Circuit

```typescript
// Check level BEFORE formatting (already implemented)
if (this.config.level > level) return;  // ← Fast path, no work done
```

### Lazy Serialization

```typescript
// Don't stringify objects unless needed
private format(level: LogLevel, message: string, data?: unknown): string {
  // Only serialize if we're actually going to log
  const dataStr = data !== undefined ? ` ${JSON.stringify(data)}` : "";
  return `${timestamp} [${level}] [${this.context}] ${message}${dataStr}`;
}
```

---

## Files to Create/Modify

### New Files

| File | Purpose |
|------|---------|
| `src/utils/LogWriter.ts` | File I/O and rotation logic |
| `src/config/logging.ts` | Logging configuration |

### Modified Files

| File | Changes |
|------|---------|
| `src/utils/Logger.ts` | Integrate LogWriter |
| `src/utils/index.ts` | Export LogWriter |
| `src/lifecycle/AppLifecycle.ts` | Flush logs on shutdown |
| `mpris-native/Cargo.toml` | Add tracing-appender |
| `mpris-native/src/lib.rs` | Use rolling file appender |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SPOTIFY_TUI_LOG_LEVEL` | `info` | Log level (debug, info, warn, error) |
| `SPOTIFY_TUI_LOG_DIR` | `~/.spotify-tui/logs` | Log directory |
| `SPOTIFY_TUI_LOG_CONSOLE` | `false` | Also log to console |
| `SPOTIFY_TUI_LOG_FORMAT` | `text` | Format (text, json) |
| `RUST_LOG` | `info` | Rust native module log level |

---

## Testing Checklist

- [ ] Logs are written to `~/.spotify-tui/logs/`
- [ ] Log rotation triggers at 5MB
- [ ] Only 5 log files are kept (oldest deleted)
- [ ] Logs are flushed on graceful exit (Ctrl+C)
- [ ] DEBUG messages are suppressed at INFO level
- [ ] Performance: No noticeable slowdown in TUI
- [ ] Rust logs also rotate properly
- [ ] Log format is parseable

---

## Future Enhancements

1. **Log viewer command** - `bun run logs` to tail logs
2. **Log search** - Search logs by context/level
3. **Remote logging** - Optional syslog/HTTP transport
4. **Metrics** - Track log volume per context
5. **Compression** - Gzip old log files
