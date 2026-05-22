# DL#140: Production Smoke Test Example

## Background

The fake-shop example has a dev-mode smoke test (`test/smoke.test.ts`) that starts the dev server, hits pages, and checks SSR output. But there's no validation of production builds, no coverage of the new deployment modes from DL#139 (self-hosted vs CDN), and the fake-shop mixes too many concerns to serve as a systematic configuration test.

We need a dedicated example project where each page isolates a specific configuration, and a smoke test suite that validates all four serving modes:

1. **Dev mode** — `jay-stack dev --test-mode`
2. **Production http + self-hosted** — `jay-stack build` + `jay-stack serve --env local` (Node HTTP server serves static files)
3. **Production http + CDN** — `jay-stack build` + `jay-stack serve --env http-cdn` (Node HTTP server, static files on separate server)
4. **Production fetch + CDN** — `jay-stack build` + `jay-stack serve --env production` (fetch handler, static files on separate server)

The build is environment-agnostic (DL#139) — same build output serves all environments. `--env` is serve-time only.

## Problem

1. No production build validation exists — we don't know if built artifacts actually serve correctly
2. No validation of the frontend/backend split from DL#139
3. No CDN-mode testing — import maps, CSS links, and client bundles referencing external URLs
4. Different page configurations (headless, headfull, actions, dynamic routes, async data, public assets) aren't tested in isolation — a failure in fake-shop doesn't tell you which configuration broke

## Design

### Example Project: `examples/jay-stack/smoke-test`

A project where each page tests one specific feature configuration. Pages are minimal — just enough to prove the configuration works.

#### Pages

| Route | What it tests |
|-------|--------------|
| `/` | Static page, no contract, no code — just jay-html |
| `/phases` | All three rendering phases (slow + fast + interactive) with a contract |
| `/headless` | Headless component from a local plugin |
| `/headfull` | Headfull full-stack component with its own jay-html |
| `/actions` | Server action (query + mutation) with service injection |
| `/dynamic/[slug]` | Dynamic route with `loadParams`, two instances |
| `/async-data` | Async data in slow and fast phases |
| `/public-assets` | Page referencing images/files from the `public/` folder |
| `/foreach` | `forEach` and `slowForEach` rendering |
| `/nested` | Nested headless inside headfull, headfull inside headfull |

#### Plugins

One local test plugin (`src/plugins/test-plugin/`) providing:
- A headless contract + component (used by `/headless`)
- A service (used by `/actions`)
- A webhook (validates invalidation in renderer mode)

#### Public Folder

```
public/
  images/
    test-image.png    # Small 1x1 PNG for validation
  data/
    test.json         # Static JSON file
```

#### Deploy Config

```yaml
# .jay-deploy
environments:
  local:
    serverStyle: http
    serveStaticFiles: true

  http-cdn:
    serverStyle: http
    serveStaticFiles: false
    staticBaseUrl: http://localhost:4001/

  production:
    serverStyle: fetch
    serveStaticFiles: false
    staticBaseUrl: http://localhost:4001/
```

The CDN environments point to a local static file server started by the test harness. This validates that URLs resolve correctly without needing a real CDN. Testing both `http` and `fetch` server styles with CDN ensures the fetch handler works identically in both wrappings.

### Smoke Test Structure

Single test file: `test/smoke.test.ts`

```
describe('smoke-test smoke')
  describe('dev mode')
    for each page: fetch and validate
    
  describe('production')
    beforeAll: build once (environment-agnostic)
    
    describe('http + self-hosted')
      beforeAll: start server --env local
      for each page: fetch and validate
    
    describe('http + cdn')
      beforeAll: start server --env http-cdn + static file server
      for each page: fetch and validate

    describe('fetch + cdn')
      beforeAll: start server --env production + static file server
      for each page: fetch and validate
    
    afterAll: stop all servers
```

#### Per-Page Validation

Each page gets a validation function that checks its specific concern:

| Page | Validation |
|------|-----------|
| `/` | Returns 200, contains expected static HTML |
| `/phases` | SSR output has slow data baked in, fast data rendered, hydration script present |
| `/headless` | Headless component's HTML present in SSR output |
| `/headfull` | Headfull component's HTML present, its CSS loaded |
| `/actions` | Action endpoint responds correctly to GET query and POST mutation |
| `/dynamic/item-a` | Correct instance rendered with item-a params |
| `/dynamic/item-b` | Correct instance rendered with item-b params |
| `/async-data` | Async swap scripts present in output |
| `/public-assets` | `<img>` src points to correct URL (self-hosted: `/public/...`, CDN: `http://localhost:4001/public/...`) |
| `/foreach` | Repeated elements present in SSR output |
| `/nested` | Nested components rendered at correct coordinates |

#### CDN-Specific Validation

In CDN mode, additionally check:
- Import map URLs start with `http://localhost:4001/`
- CSS `<link>` href starts with `http://localhost:4001/`
- Client bundle `<script>` src starts with `http://localhost:4001/`
- Static file server responds to shared chunk requests
- Static file server responds to instance bundle requests
- Public assets served from static file server

#### Static File Server for CDN Tests

The test harness starts a minimal HTTP server that serves `build/v{n}/frontend/` on port 4001. This simulates a CDN.

```typescript
async function startStaticServer(frontendDir: string, port: number): Promise<ChildProcess> {
    // Simple static file server over the frontend/ folder
}
```

### Test Harness Utilities

Extracted from fake-shop's smoke test into a shared helper:

```typescript
interface SmokeTestServer {
    url: string;
    stop(): Promise<void>;
}

async function startDevServer(projectDir: string, port: number): Promise<SmokeTestServer>;
async function startProductionServer(projectDir: string, port: number, env?: string): Promise<SmokeTestServer>;
async function startStaticFileServer(dir: string, port: number): Promise<SmokeTestServer>;
async function fetchPage(baseUrl: string, path: string): Promise<{ status: number; html: string }>;
```

### Port Allocation

| Server | Port |
|--------|------|
| Dev server | 3300 |
| Production server | 4000 |
| Static file server (CDN sim) | 4001 |

### Running

```bash
cd examples/jay-stack/smoke-test

# Run all smoke tests
yarn test:smoke

# Run only dev mode tests
yarn vitest run test/smoke.test.ts -t "dev mode"

# Run only production tests
yarn vitest run test/smoke.test.ts -t "production"
```

## Implementation Plan

### Phase 1: Example project skeleton

1. Create `examples/jay-stack/smoke-test/` with package.json, .jay, tsconfig
2. Create the static page (`/`) and the phases page (`/phases`) with contracts
3. Create the test plugin with headless contract + component + service
4. Create remaining pages one by one, each with its contract and jay-html
5. Add `public/` folder with test assets
6. Add `.jay-deploy` with `local` and `cdn` environments
7. Verify project works with `jay-stack dev`

### Phase 2: Dev mode smoke test

1. Create `test/smoke.test.ts` with test harness utilities
2. Add dev mode describe block — start dev server, validate all pages
3. Run and verify

### Phase 3: Production smoke tests

1. Add production self-hosted describe block — build, serve, validate
2. Add production CDN describe block — build with cdn env, serve + static server, validate
3. CDN-specific checks (import map URLs, asset URLs)
4. Run full suite

### Phase 4: Wire into monorepo

1. Add `test:smoke` script to smoke-test package.json
2. Optionally add to root-level test suite (may want to keep smoke tests separate due to duration)

## Trade-offs

- **Separate project vs extending fake-shop**: Separate is cleaner — each page is minimal and tests one thing. Fake-shop stays as the "realistic app" example; smoke-test is the "systematic validation" example.
- **Local static server vs mock CDN**: Using a real HTTP server on localhost is more realistic than mocking. The only downside is port management, but with fixed ports and proper cleanup it's straightforward.
- **Test duration**: Three server modes × 10+ pages will take 30-60 seconds. Worth it for deployment confidence. Keep smoke tests in a separate script from unit tests.

## Verification

1. All pages render correctly in dev mode
2. All pages render correctly in production self-hosted mode
3. All pages render correctly in production CDN mode
4. Import maps, CSS links, and client bundles reference correct base URLs per mode
5. Public folder assets accessible in all modes
6. Actions work in all modes
7. Dynamic routes resolve to correct instances in all modes
8. Test suite runs in under 90 seconds
9. Test suite cleans up all child processes on success and failure
