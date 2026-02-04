# Design Log 83: Dev Server Logging and Timing

## Background

The jay-stack-cli `dev` command outputs verbose logging during transformations, making it hard to see important information. Developers need:
1. Clean output by default
2. Verbose mode for debugging
3. Performance timing for key operations

## Problem

Current dev server output includes many transformation logs that clutter the console. There's no way to:
- Suppress verbose logging
- Enable detailed logging when needed
- See timing metrics for load params, slow/fast rendering, and Vite compilation

## Design

### 1. CLI Flags

Add flags to `dev` command in `stack-cli/lib/cli.ts`:

```typescript
.option('-v, --verbose', 'Enable verbose logging output')
.option('-q, --quiet', 'Suppress all non-error output')
```

### 2. Logger Abstraction

Create a centralized logger in `dev-server/lib/logger.ts`:

```typescript
export type LogLevel = 'silent' | 'error' | 'info' | 'verbose';

export interface DevServerLogger {
  level: LogLevel;
  info: (msg: string) => void;
  verbose: (msg: string) => void;
  error: (msg: string) => void;
  timing: TimingLogger;
}

export interface TimingLogger {
  startRequest: (requestId: string, path: string) => void;
  recordLoadParams: (requestId: string, ms: number) => void;
  recordSlowRender: (requestId: string, ms: number) => void;
  recordFastRender: (requestId: string, ms: number) => void;
  recordViteCompile: (requestId: string, ms: number) => void;
  endRequest: (requestId: string) => void;
}
```

### 3. Timing Display

For each request, display a single updating line:

```
GET /page [load: 45ms | slow: 123ms | fast: 12ms | vite: 89ms] total: 269ms
```

Use `process.stdout.write` with `\r` to update in place during the request, then `\n` when complete.

### 4. Timing Measurement Points

Based on code exploration:

| Operation | Location | Function/Method |
|-----------|----------|-----------------|
| Load Params | `load-page-parts.ts:50-156` | `loadPageParts()` |
| Slow Render | `dev-server.ts:356,493` | `slowlyPhase.runSlowlyForPage()` |
| Fast Render | `dev-server.ts:291,417,503` | `renderFastChangingData()` |
| Vite Compile | `dev-server.ts:577` | `vite.transformIndexHtml()` |

### 5. Configuration Flow

```
cli.ts (--verbose/--quiet)
  → server.ts (StartDevServerOptions.logLevel)
    → dev-server.ts (DevServerOptions.logger)
      → vite-factory.ts (logLevel mapping)
```

### 6. Vite Log Level Mapping

| Jay LogLevel | Vite logLevel |
|--------------|---------------|
| silent       | silent        |
| error        | error         |
| info         | warn          |
| verbose      | info          |

## Implementation Plan

### Phase 1: Logger Infrastructure
1. Create `dev-server/lib/logger.ts` with `DevServerLogger` interface
2. Create `mkDevServerLogger(level: LogLevel)` factory
3. Add `logLevel` to `DevServerOptions` and `StartDevServerOptions`
4. Update `cli.ts` to accept `--verbose` and `--quiet` flags

### Phase 2: Replace Console Calls
1. Pass logger through to `mkDevServer()`
2. Replace `console.log` calls in `dev-server.ts` with `logger.verbose()`
3. Keep `console.error` for actual errors

### Phase 3: Add Timing
1. Add `TimingLogger` implementation with request tracking
2. Wrap key operations with timing calls
3. Implement updating line display with `\r`

### Phase 4: Wire Vite Logging
1. Map log level to Vite's `logLevel` option
2. Pass through `viteFactory.ts`

## Examples

### Default output (clean)

```
  Jay Stack Dev Server
  Local: http://localhost:5555/

GET /page [load: 45ms | slow: 123ms | fast: 12ms | vite: 89ms] 269ms
GET /api/data 15ms
```

### Verbose output (`--verbose`)

```
  Jay Stack Dev Server
  Local: http://localhost:5555/

[verbose] Service lifecycle starting...
[verbose] Loading plugin: @jay-framework/my-plugin
[verbose] Route registered: /page
GET /page
  [verbose] loadPageParts: loading /src/pages/page.tsx
  [verbose] loadPageParts: parsing jay-html
  [verbose] slowlyPhase: running slow render
  [verbose] Cache: storing pre-rendered HTML
  [load: 45ms | slow: 123ms | fast: 12ms | vite: 89ms] 269ms
```

### Quiet output (`--quiet`)

```
(only errors shown)
```

## Trade-offs

1. **Single updating line vs multi-line**: Updating line is cleaner but may not work well in all terminals. Fallback to multi-line when `!process.stdout.isTTY`.

2. **Request ID generation**: Simple incrementing counter is sufficient for dev server.

3. **Logger injection vs global**: Injection is cleaner but requires threading through. Worth it for testability.

## Questions

1. **Q: Should timing be opt-in?**
   A: No, timing in the single-line format is useful and non-intrusive by default.

2. **Q: Should we time SSR module loads separately?**
   A: Include in "load params" for simplicity. Can break out later if needed.
