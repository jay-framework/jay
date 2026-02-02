# Testing Jay Stack Applications

This guide covers testing strategies for Jay Stack applications, from unit tests to smoke tests and CI integration.

## Dev Server Test Mode

The Jay Stack CLI includes a test mode for reliable automated testing:

```bash
jay-stack dev --test-mode           # Enable test endpoints
jay-stack dev --timeout 60          # Auto-shutdown after 60 seconds
jay-stack dev --test-mode --timeout 120  # Combined
```

### Test Endpoints

When `--test-mode` is enabled, the following endpoints become available:

| Endpoint         | Method | Response                                                        |
| ---------------- | ------ | --------------------------------------------------------------- |
| `/_jay/health`   | GET    | `{"status":"ready","port":3300,"editorPort":3301,"uptime":5.2}` |
| `/_jay/shutdown` | POST   | `{"status":"shutting_down"}`                                    |

### Health Check

The health endpoint is useful for:

- Waiting for server readiness in CI
- Detecting the dynamically assigned port
- Monitoring server uptime

```bash
# Poll until ready
while ! curl -s http://localhost:3300/_jay/health | grep -q "ready"; do
    sleep 1
done
echo "Server is ready!"
```

### Graceful Shutdown

The shutdown endpoint provides clean termination:

```bash
curl -X POST http://localhost:3300/_jay/shutdown
```

This gracefully stops:

- The dev server
- The editor server
- All Vite workers
- Any registered shutdown callbacks

### Auto-Timeout

For CI safety, use `--timeout` to prevent hung builds:

```bash
# Server will auto-terminate after 2 minutes
jay-stack dev --timeout 120
```

## Writing Smoke Tests

Smoke tests verify that your application starts correctly and pages render without errors.

### Using Vitest

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';

describe('Application Smoke Tests', () => {
  let serverUrl: string;
  let serverProcess: ChildProcess;

  beforeAll(async () => {
    // Start server with test mode
    serverProcess = spawn('yarn', ['dev', '--test-mode'], {
      cwd: process.cwd(),
      shell: true,
    });

    // Wait for health endpoint
    serverUrl = await waitForHealthy(30000);
  }, 35000);

  afterAll(async () => {
    // Clean shutdown via endpoint
    await fetch(`${serverUrl}/_jay/shutdown`, { method: 'POST' });
  });

  it('should render home page', async () => {
    const response = await fetch(`${serverUrl}/`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('<!doctype html>');
  });

  it('should render products page', async () => {
    const response = await fetch(`${serverUrl}/products/`);

    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain('client error');
  });
});

async function waitForHealthy(timeout: number): Promise<string> {
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
    await new Promise((r) => setTimeout(r, 500));
  }

  throw new Error(`Server not ready within ${timeout}ms`);
}
```

### Adding to package.json

```json
{
  "scripts": {
    "test": "vitest run",
    "test:smoke": "vitest run test/smoke.test.ts"
  }
}
```

## CI Integration

### GitHub Actions Example

```yaml
name: Smoke Tests

on: [push, pull_request]

jobs:
  smoke-test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - run: yarn install

      - name: Run Smoke Tests
        run: yarn test:smoke
        timeout-minutes: 5
```

### Shell Script Alternative

For simpler CI setups:

```bash
#!/bin/bash
set -e

# Start server with auto-timeout (safety net)
yarn dev --test-mode --timeout 120 &
SERVER_PID=$!

# Wait for ready
for i in {1..30}; do
    if curl -s http://localhost:3300/_jay/health 2>/dev/null | grep -q "ready"; then
        echo "Server ready!"
        break
    fi
    sleep 1
done

# Run tests
TEST_EXIT=0
curl -sf http://localhost:3300/ > /dev/null || TEST_EXIT=1
curl -sf http://localhost:3300/products/ > /dev/null || TEST_EXIT=1

# Cleanup
curl -X POST http://localhost:3300/_jay/shutdown 2>/dev/null || true
wait $SERVER_PID 2>/dev/null || true

exit $TEST_EXIT
```

## Testing Services (Symbol Identity)

Jay Stack uses Symbols for service markers. In development, ensure services are resolved correctly:

```typescript
it('should resolve services without Symbol identity issues', async () => {
  const response = await fetch(`${serverUrl}/products/`);
  const html = await response.text();

  // "client error" often indicates a service resolution failure
  expect(html).not.toContain('client error');
  expect(html).not.toContain('Service');
  expect(html).not.toContain('not found');
});
```

If you see "Service 'X' not found" errors, ensure:

1. Services are registered in `src/init.ts`
2. Plugin dependencies are correctly ordered
3. Vite SSR externals include `@jay-framework/*` packages

## Unit Testing Components

Test rendering functions in isolation:

```typescript
import { describe, it, expect } from 'vitest';
import { phaseOutput, notFound } from '@jay-framework/fullstack-component';

// Mock service
const mockProductsDb = {
  getProductBySlug: async (slug: string) => {
    if (slug === 'test-product') {
      return { id: '123', name: 'Test Product', price: 99.99 };
    }
    return null;
  },
};

describe('Product Page', () => {
  it('should render product data', async () => {
    const props = { slug: 'test-product' };
    const result = await slowlyRender(props, mockProductsDb);

    expect(result.kind).toBe('PhaseOutput');
    if (result.kind === 'PhaseOutput') {
      expect(result.rendered.name).toBe('Test Product');
      expect(result.carryForward.productId).toBe('123');
    }
  });

  it('should return 404 for missing product', async () => {
    const props = { slug: 'missing-product' };
    const result = await slowlyRender(props, mockProductsDb);

    expect(result.kind).toBe('ClientError');
    expect(result.status).toBe(404);
  });
});
```

## Best Practices

1. **Use test mode for CI**: Always use `--test-mode` in automated tests
2. **Set timeouts**: Use `--timeout` to prevent hung builds
3. **Poll for readiness**: Use the health endpoint instead of fixed delays
4. **Clean shutdown**: Always call `/_jay/shutdown` in afterAll
5. **Check for errors**: Look for "client error" and "server error" in responses
6. **Test dynamic routes**: Include parameterized routes in smoke tests

## Related

- [Jay Stack Components](./jay-stack.md) - Component architecture
- [Server Actions](./server-actions.md) - Testing server actions
- [Building Jay Packages](./building-jay-packages.md) - Plugin testing
