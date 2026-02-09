# Design Log #81: Dev Server Test Mode

## Background

When running smoke tests or integration tests against the dev server, we need reliable ways to:

1. Know when the server is ready to accept requests
2. Cleanly shut down the server after tests complete
3. Optionally auto-terminate after a timeout (for CI safety)

Currently, tests must:

- Spawn the dev server as a child process
- Parse stdout for "Jay Stack dev server started successfully"
- Kill the process when done (via SIGTERM)

This is fragile - port detection requires regex parsing, and process cleanup can leave orphaned Vite workers.

## Problem

1. **Readiness detection**: No standard way to know server is ready
2. **Cleanup**: Process.kill() doesn't always clean up child processes
3. **CI safety**: Long-running server can hang CI if tests fail
4. **Port detection**: Server port is dynamic, requires parsing output

## Questions and Answers

**Q1: Should this be a separate CLI command or flags on `dev`?**
A1: Flags on `dev` - keeps it simple, `--test-mode` enables test features.

**Q2: Should shutdown require authentication?**
A2: No - test mode is explicitly opt-in. In production builds, these endpoints won't exist.

**Q3: Should we use a dedicated test port range?**
A3: No - keep dynamic port allocation, but make it easier to detect.

## Design

### CLI Flags

```bash
# Enable test mode (health + shutdown endpoints)
jay-stack-cli dev --test-mode

# Auto-shutdown after N seconds (implies --test-mode)
jay-stack-cli dev --timeout 60

# Combined
jay-stack-cli dev --test-mode --timeout 30
```

### Endpoints (only when --test-mode is enabled)

| Endpoint         | Method | Response                         | Purpose           |
| ---------------- | ------ | -------------------------------- | ----------------- |
| `/_jay/health`   | GET    | `{"status":"ready","port":3300}` | Readiness check   |
| `/_jay/shutdown` | POST   | `{"status":"shutting_down"}`     | Graceful shutdown |

### Startup Output Enhancement

```
🚀 Jay Stack dev server started successfully!
📱 Dev Server: http://localhost:3300
🎨 Editor Server: http://localhost:3301
📁 Pages directory: ./src/pages
🧪 Test Mode: enabled
   Health: http://localhost:3300/_jay/health
   Shutdown: curl -X POST http://localhost:3300/_jay/shutdown
   Timeout: 60s
```

### JSON Output Mode (for programmatic use)

```bash
jay-stack-cli dev --test-mode --json
```

Outputs on ready:

```json
{ "event": "ready", "devServer": "http://localhost:3300", "editorServer": "http://localhost:3301" }
```

## Implementation Plan

### Phase 1: Core Test Mode

1. Add `--test-mode` and `--timeout` flags to CLI
2. Add `/_jay/health` endpoint returning `{status: "ready", port: number}`
3. Add `/_jay/shutdown` endpoint that calls graceful shutdown
4. Update startup output to show test mode info

### Phase 2: Enhanced Smoke Tests

1. Update fake-shop smoke test to use health endpoint for readiness
2. Use shutdown endpoint for cleanup instead of process.kill()
3. Add timeout flag for CI safety

### Phase 3: Optional Enhancements

1. JSON output mode for programmatic parsing
2. `--port` flag to request specific port (fail if unavailable)

## Code Changes

### CLI (jay-stack-cli)

```typescript
// commands/dev.ts
.option('--test-mode', 'Enable test endpoints (/_jay/health, /_jay/shutdown)')
.option('--timeout <seconds>', 'Auto-shutdown after N seconds (implies --test-mode)', parseInt)
```

### Dev Server

```typescript
// dev-server.ts
if (options.testMode) {
  app.get('/_jay/health', (req, res) => {
    res.json({ status: 'ready', port: options.port });
  });

  app.post('/_jay/shutdown', async (req, res) => {
    res.json({ status: 'shutting_down' });
    await gracefulShutdown();
    process.exit(0);
  });
}

if (options.timeout) {
  setTimeout(() => {
    console.log(`[DevServer] Timeout (${options.timeout}s) reached, shutting down`);
    gracefulShutdown().then(() => process.exit(0));
  }, options.timeout * 1000);
}
```

## Examples

### Smoke Test (Updated)

```typescript
describe('Smoke Tests', () => {
  let serverUrl: string;

  beforeAll(async () => {
    // Start with test mode and timeout
    spawn('yarn', ['dev', '--test-mode', '--timeout', '120']);

    // Wait for health endpoint (polls until ready)
    serverUrl = await waitForHealthy('http://localhost:3300/_jay/health', 30000);
  });

  afterAll(async () => {
    // Clean shutdown via endpoint
    await fetch(`${serverUrl}/_jay/shutdown`, { method: 'POST' });
  });

  it('should render products page', async () => {
    const res = await fetch(`${serverUrl}/products/`);
    expect(res.status).toBe(200);
  });
});

async function waitForHealthy(url: string, timeout: number): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const { port } = await res.json();
        return `http://localhost:${port}`;
      }
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server not ready within ${timeout}ms`);
}
```

### CI Script

```bash
#!/bin/bash
# Start server with 2-minute timeout
yarn dev --test-mode --timeout 120 &

# Wait for ready
for i in {1..30}; do
    if curl -s http://localhost:3300/_jay/health | grep -q "ready"; then
        break
    fi
    sleep 1
done

# Run tests
yarn test:smoke
TEST_EXIT=$?

# Cleanup (server will auto-shutdown, but be explicit)
curl -X POST http://localhost:3300/_jay/shutdown 2>/dev/null || true

exit $TEST_EXIT
```

## Trade-offs

| Approach                  | Pros                            | Cons                     |
| ------------------------- | ------------------------------- | ------------------------ |
| **Test mode flag**        | Explicit opt-in, no prod impact | Extra flag to remember   |
| **Always-on endpoints**   | Simpler                         | Security concern in prod |
| **Separate test command** | Clear separation                | Code duplication         |

**Decision**: Test mode flag - explicit and safe.

## Security Considerations

- `/_jay/shutdown` only available with `--test-mode`
- Shutdown endpoint is POST-only (no accidental browser trigger)
- No authentication needed since test mode is explicit opt-in
- Production builds should never use `--test-mode`

---

## Related Design Logs

- **#80 - Materializing Dynamic Contracts**: Smoke tests for Symbol identity
- **#77 - Automation Dev Server Integration**: Dev tooling
