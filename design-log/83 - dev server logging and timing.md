# Design Log 83: Dev Server Logging and Timing

## Background

The jay-stack-cli `dev` command outputs verbose logging during transformations, making it hard to see important information. Developers need:

1. Clean output by default (keep startup messages)
2. Verbose mode for debugging
3. Performance timing for key operations

## Problem

Current dev server output includes many transformation logs that clutter the console. There's no way to:

- Suppress verbose logging while keeping important startup info
- Enable detailed logging when needed
- See timing metrics for SSR, load params, slow/fast rendering, and Vite compilation

## Design

### 1. CLI Flags

Add flags to `dev` command in `stack-cli/lib/cli.ts`:

```typescript
.option('-v, --verbose', 'Enable verbose logging output')
.option('-q, --quiet', 'Suppress all non-error output')
```

### 2. New Logger Package

Create a new package `@jay-framework/logger` that all compiler/runtime packages can depend on.

**Package structure:**

```
packages/jay-stack/logger/
├── lib/
│   └── index.ts
├── package.json
└── tsconfig.json
```

**In `logger/lib/index.ts`:**

```typescript
export type LogLevel = 'silent' | 'info' | 'verbose';

export interface JayLogger {
  /** Log important messages - shown in default mode (startup, major events) */
  important: (msg: string) => void;
  /** Log info messages - shown only in verbose mode */
  info: (msg: string) => void;
  /** Log warnings - shown unless silent */
  warn: (msg: string) => void;
  /** Log errors - always shown */
  error: (msg: string) => void;
}

// Default implementation using console
const defaultLogger: JayLogger = {
  important: (msg) => console.log(msg),
  info: (msg) => console.log(msg),
  warn: (msg) => console.warn(msg),
  error: (msg) => console.error(msg),
};

let currentLogger: JayLogger = defaultLogger;

export function getLogger(): JayLogger {
  return currentLogger;
}

export function setLogger(logger: JayLogger): void {
  currentLogger = logger;
}

export function resetLogger(): void {
  currentLogger = defaultLogger;
}
```

**In `stack-cli/lib/server.ts`:** Replace the logger at startup with a level-aware implementation:

```typescript
import { setLogger } from '@jay-framework/logger';

// Create level-aware logger
function createCliLogger(level: LogLevel): JayLogger {
  const isQuiet = level === 'silent';
  const isVerbose = level === 'verbose';

  return {
    important: isQuiet ? () => {} : (msg) => console.log(msg),
    info: isVerbose ? (msg) => console.log(msg) : () => {},
    warn: isQuiet ? () => {} : (msg) => console.warn(msg),
    error: (msg) => console.error(msg),
  };
}

setLogger(createCliLogger(options.logLevel));
```

### 3. Timing Display

For each request, display a single updating line with SSR timing broken out:

```
GET /page [vite-ssr: 23ms | params: 22ms | slow: 123ms | fast: 12ms | vite-client: 89ms] 269ms
```

Use `process.stdout.write` with `\r` to update in place during the request, then `\n` when complete. Fallback to multi-line when `!process.stdout.isTTY`.

### 4. Timing Measurement Points

| Operation       | Location                            | What it measures                                        |
| --------------- | ----------------------------------- | ------------------------------------------------------- |
| **vite-ssr**    | `load-page-parts.ts` lines 67, 105  | `vite.ssrLoadModule()` - server-side module compilation |
| **params**      | `load-page-parts.ts` lines 81       | `parseJayFile()` + manifest loading                     |
| **slow**        | `dev-server.ts` lines 356, 493      | `slowlyPhase.runSlowlyForPage()`                        |
| **fast**        | `dev-server.ts` lines 291, 417, 503 | `renderFastChangingData()`                              |
| **vite-client** | `dev-server.ts` line 577            | `vite.transformIndexHtml()` - client-side transform     |

### 5. What to Keep in Default Mode

**Keep as `important()` - shown in default mode (startup messages in `server.ts`):**

```
⚠️  Public folder not found: ./public
🚀 Jay Stack dev server started successfully!
📱 Dev Server: http://localhost:3200
🎨 Editor Server: http://localhost:3301 (ID: cms-example-editor)
📁 Pages directory: ./src/pages
```

**Move to `info()` - shown only in verbose mode:**

- `[SlowRender] Cached pre-rendered jay-html at ...`
- `[SlowRender] Cache invalidated for ...`
- `[Services] lib/init.ts changed, reloading services...`
- `[Actions] Action router mounted at ...`
- `[Contracts] Materialized N dynamic contract(s)`
- All validation output during requests

### 6. Vite Log Level Mapping

| Jay LogLevel | Vite logLevel |
| ------------ | ------------- |
| silent       | silent        |
| info         | warn          |
| verbose      | info          |

## Implementation Plan

### Phase 1: Logger Package

1. Create new package `packages/jay-stack/logger/`
2. Implement `JayLogger` interface with `important`, `info`, `warn`, `error`
3. Implement default console-based logger
4. Export `getLogger()`, `setLogger()`, `resetLogger()`
5. Add to workspace dependencies

### Phase 2: CLI Integration

1. Update `stack-cli/lib/cli.ts` to accept `--verbose` and `--quiet` flags for `dev` command
2. Update `compiler/cli` to accept `--verbose` and `--quiet` flags
3. Create level-aware logger factory (can be shared or duplicated - simple code)
4. Call `setLogger()` at startup in both CLIs
5. Convert startup messages to use `getLogger().important()`

### Phase 3: Replace Console Calls

**jay-stack packages:**

- `dev-server` - dev-server.ts, service-lifecycle.ts
- `stack-server-runtime` - action-discovery.ts, plugin-init-discovery.ts, plugin-scanner.ts, contract-materializer.ts
- `stack-cli` - cli.ts, server.ts, validate.ts, editor-handlers.ts, config.ts
- `route-scanner` - route-scanner.ts
- `editor-server` - editor-server.ts

**compiler packages:**

- `compiler-jay-html` - expression-compiler.ts
- `compiler-jay-stack` - index.ts, plugin-client-import-resolver.ts, transform-action-imports.ts, import-chain-tracker.ts
- `compiler/cli` - generate-files.ts
- `rollup-plugin` - various files

For each:

1. Add `@jay-framework/logger` dependency
2. Replace `console.log` with `getLogger().info()`
3. Replace `console.error` with `getLogger().error()`
4. Replace `console.warn` with `getLogger().warn()`
5. Keep test files as-is (they can use console directly)

### Phase 4: Add Timing

1. Add `RequestTimingLogger` interface to logger package
2. Extend `JayLogger` with optional `timing` property
3. Implement timing display with TTY detection in CLI logger
4. Add timing wrapper in `dev-server.ts` request handlers
5. Pass timing object through to `loadPageParts()`
6. Add timing calls around each measured operation

### Phase 5: Wire Vite Logging

1. Map log level to Vite's `logLevel` option
2. Pass through `viteFactory.ts`

## Examples

### Default output (clean)

Startup messages use `important()`, request timing always shown:

```
⚠️  Public folder not found: ./public
🚀 Jay Stack dev server started successfully!
📱 Dev Server: http://localhost:3200
🎨 Editor Server: http://localhost:3301 (ID: cms-example-editor)
📁 Pages directory: ./src/pages

GET /page [vite-ssr: 23ms | params: 22ms | slow: 123ms | fast: 12ms | vite-client: 89ms] 269ms
GET /api/action 15ms
```

### Verbose output (`--verbose`)

Additional `info()` messages shown:

```
⚠️  Public folder not found: ./public
🚀 Jay Stack dev server started successfully!
📱 Dev Server: http://localhost:3200
🎨 Editor Server: http://localhost:3301 (ID: cms-example-editor)
📁 Pages directory: ./src/pages

[Services] Initialization complete
[Actions] Auto-registered 5 action(s) total
[Actions] Action router mounted at /_action
GET /page
  [info] loadPageParts: loading /src/pages/page.tsx
  [info] loadPageParts: parsing jay-html
  [info] slowlyPhase: running slow render
  [info] SlowRender: cached at /src/pages/page.prerender.jay-html
  [vite-ssr: 23ms | params: 22ms | slow: 123ms | fast: 12ms | vite-client: 89ms] 269ms
```

### Quiet output (`--quiet`)

```
(only errors shown)
```

## Trade-offs

1. **New package vs globalThis**: A dedicated logger package is cleaner than globalThis and allows compiler packages to depend on it directly. Small package with minimal dependencies.

2. **important vs info**: Two info-level logs adds slight complexity but matches real usage - some messages should always show (startup), others only in verbose mode.

3. **Single updating line vs multi-line**: Updating line is cleaner but may not work well in all terminals. Fallback to multi-line when `!process.stdout.isTTY`.

4. **Timing overhead**: Minimal - just `performance.now()` calls. Worth it for the visibility.

## Questions

1. **Q: Should timing be opt-in?**
   A: No, timing in the single-line format is useful and non-intrusive by default.

2. ~~**Q: Should we time SSR module loads separately?**~~
   ~~A: Include in "load params" for simplicity. Can break out later if needed.~~
   A: Yes, separate SSR timing is useful for understanding Vite compilation overhead.

---

## Implementation Results

### Phase 1-3 Complete (Feb 4, 2026)

**Created:**

- `packages/jay-stack/logger/` - New logger package with:
  - `JayLogger` interface: `important()`, `info()`, `warn()`, `error()`
  - `getLogger()`, `setLogger()`, `resetLogger()`, `createLogger(level)`
  - `JayDevLogger` interface with `RequestTiming` for future timing support

**Modified:**

- `stack-cli/lib/cli.ts` - Added `-v, --verbose` and `-q, --quiet` flags to `dev` command
- `stack-cli/lib/server.ts` - Startup messages use `log.important()`, imports logger
- `dev-server/lib/dev-server.ts` - All console calls replaced with logger
- `dev-server/lib/service-lifecycle.ts` - All console calls replaced with logger
- `dev-server/package.json` - Added `@jay-framework/logger` dependency
- `stack-cli/package.json` - Added `@jay-framework/logger` dependency
- `stack-server-runtime/package.json` - Added `@jay-framework/logger` dependency

**Tests:** All 13 dev-server tests pass, all 39 stack-cli tests pass.

### Compiler Package Updates (Feb 4, 2026)

Extended logger usage to compiler packages as specified in Phase 3:

**compiler-jay-html:**

- Added `@jay-framework/logger` dependency
- `expression-compiler.ts` - `console.warn` → `getLogger().warn()`

**compiler-jay-stack:**

- Added `@jay-framework/logger` dependency
- `index.ts` - `console.error/warn` → `getLogger().error/warn()`
- `plugin-client-import-resolver.ts` - `console.log` → `getLogger().info()`
- `transform-action-imports.ts` - `console.warn` → `getLogger().warn()`
- `import-chain-tracker.ts` - All `console.log/warn/error` → `getLogger().info/warn/error()`

**rollup-plugin:**

- Added `@jay-framework/logger` dependency
- `runtime-compiler.ts` - `console.log` → `getLogger().info()`

**compiler/cli (jay-cli):**

- Added `@jay-framework/logger` dependency
- `generate-files.ts` - `console.log` → `getLogger().important/info/error()`

**stack-server-runtime:**

- `contract-materializer.ts` - All verbose logs → `getLogger().info()`, errors → `getLogger().error()`
- `plugin-init-discovery.ts` - `console.log/warn/error` → `getLogger().info/warn/error()`
- `plugin-scanner.ts` - `console.log/warn` → `getLogger().info/warn()`
- `action-discovery.ts` - All `console.log/warn/error` → `getLogger().info/warn/error()`
- `generate-client-script.ts` - Kept `console.log` (browser-side logs in generated code)

### Phase 4-5 Complete (Feb 4, 2026)

**Phase 4: Timing Instrumentation**

- Added `createDevLogger(level)` factory to logger package that creates a logger with `startRequest(method, path)` for timing
- `RequestTiming` interface with `recordViteSsr`, `recordParams`, `recordSlowRender`, `recordFastRender`, `recordViteClient`, `end`
- Timing display: `GET /page [vite-ssr: 23ms | params: 22ms | slow: 123ms | fast: 12ms | vite-client: 89ms] 269ms`
- Uses `\r` for in-place updates on TTY, falls back to single line on non-TTY
- Updated `dev-server.ts` request handlers to use timing:
  - `mkRoute()` starts timing with `getDevLogger()?.startRequest()`
  - Timing passed through to `handleCachedRequest`, `handlePreRenderRequest`, `handleDirectRequest`, `sendResponse`
  - Each handler records timing for its phases

**Phase 5: Vite Log Level**

- Added `logLevel?: LogLevel` to `DevServerOptions`
- `mkDevServer()` maps Jay log level to Vite: silent→silent, info→warn, verbose→info
- `stack-cli/lib/server.ts` passes `logLevel` to `mkDevServer()`

**Tests:** All 13 dev-server tests pass, all 39 stack-cli tests pass.
