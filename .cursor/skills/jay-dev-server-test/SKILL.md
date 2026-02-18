---
name: jay-dev-server-test
description: Run Jay Stack dev server with test mode for automated testing and CI. Use when running smoke tests, integration tests, or needing reliable server startup/shutdown. Handles health checks, graceful shutdown, and auto-timeout.
---

# Jay Dev Server Test Mode

Run the Jay Stack dev server with test mode for reliable automated testing.

## Quick Start

```bash
# Start with test mode (enables endpoints)
yarn jay-stack dev --test-mode

# Start with auto-timeout (implies test mode)
yarn jay-stack dev --timeout 60

# Combined
yarn jay-stack dev --test-mode --timeout 120
```

## Test Endpoints

| Endpoint | Method | Response |
|----------|--------|----------|
| `/_jay/health` | GET | `{"status":"ready","port":3300,"editorPort":3301,"uptime":5.2}` |
| `/_jay/shutdown` | POST | `{"status":"shutting_down"}` |

## Waiting for Server Ready

Poll the health endpoint until ready:

```typescript
async function waitForServer(timeout = 30000): Promise<string> {
    const start = Date.now();
    
    while (Date.now() - start < timeout) {
        try {
            const res = await fetch('http://localhost:3300/_jay/health');
            if (res.ok) {
                const { port } = await res.json();
                return `http://localhost:${port}`;
            }
        } catch {
            // Not ready yet
        }
        await new Promise(r => setTimeout(r, 500));
    }
    throw new Error(`Server not ready within ${timeout}ms`);
}
```

## Graceful Shutdown

```bash
curl -X POST http://localhost:3300/_jay/shutdown
```

Or in code:

```typescript
await fetch(`${serverUrl}/_jay/shutdown`, { method: 'POST' });
```

## Smoke Test Pattern

```typescript
import { spawn, ChildProcess } from 'child_process';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('Smoke Tests', () => {
    let serverUrl: string;
    let serverProcess: ChildProcess;

    beforeAll(async () => {
        serverProcess = spawn('yarn', ['dev', '--test-mode'], {
            cwd: process.cwd(),
            shell: true,
        });

        serverUrl = await waitForServer(30000);
    }, 35000);

    afterAll(async () => {
        await fetch(`${serverUrl}/_jay/shutdown`, { method: 'POST' });
    });

    it('renders home page', async () => {
        const res = await fetch(`${serverUrl}/`);
        expect(res.status).toBe(200);
        expect(await res.text()).toContain('<!doctype html>');
    });
});
```

## CI Script Pattern

```bash
#!/bin/bash
set -e

# Start with safety timeout
yarn dev --timeout 120 &

# Wait for ready
for i in {1..30}; do
    if curl -s http://localhost:3300/_jay/health | grep -q "ready"; then
        break
    fi
    sleep 1
done

# Run tests
curl -sf http://localhost:3300/ > /dev/null

# Clean shutdown
curl -X POST http://localhost:3300/_jay/shutdown
```

## Working Example

See `jay/examples/jay-stack/fake-shop/test/smoke.test.ts` for a complete implementation.

## Key Points

- Always use `--test-mode` for automated tests
- Use `--timeout` as a safety net in CI
- Poll `/_jay/health` instead of fixed delays
- Call `/_jay/shutdown` in afterAll for clean cleanup
- The port may vary; parse it from health response or stdout
