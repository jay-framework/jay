# Design Log #150 — Build Content Hash

## Background

When deploying to Wix BaaS, we need client (CDN) and server (backend worker) artifacts to stay in sync. Today the build version comes from `package.json` and doesn't change between deploys unless manually bumped. If a developer rebuilds and redeploys without bumping the version, the CDN and backend can serve mismatched artifacts.

## Problem

We need a content-derived identifier that changes whenever the build output changes, regardless of the semver version string. This hash can serve as a deployment cache key to guarantee client/server consistency.

## Design

### What to hash

All files under the build directory (`build/v{version}/`) — both `frontend/` and `backend/` — excluding `build-metadata.json` itself (since it contains the hash).

### Hash algorithm

- SHA-256 over a deterministic stream: sort file paths lexicographically, then for each file feed `relativePath + content` into the hash
- Truncate to first 12 hex characters — short enough for URLs/keys, long enough to avoid collisions in practice

### Where to store

The `BuildMetadata` type already has a `sourceHash: string` field (currently set to `''`). Populate it.

### Where to compute

In `build-pipeline.ts`, after all build artifacts are written (route manifest, server elements, client bundles, public folder copy) but before writing `build-metadata.json`.

## Implementation Plan

### Phase 1: Single file change

**File:** `packages/jay-stack/production-server/lib/builder/build-pipeline.ts`

1. Add a `computeBuildHash(dir: string): Promise<string>` function:

   - Recursively collect all file paths under `dir`
   - Filter out `build-metadata.json`
   - Sort paths lexicographically
   - Create a SHA-256 hash, update with each file's relative path and content
   - Return first 12 hex chars

2. Call it at ~line 546 (after `writeRouteManifest` and public folder copy, before metadata write):

   ```ts
   const sourceHash = await computeBuildHash(buildDir);
   ```

3. Set `sourceHash` in the metadata object (replacing `''`).

No type changes needed — `BuildMetadata.sourceHash` already exists.

## Verification

- `jay-stack-cli build` on an example project → `build-metadata.json` has non-empty `sourceHash`
- Two identical builds → same hash
- Change a source file, rebuild → different hash

## Implementation Results

### Hash computation — implemented as designed

- `computeBuildHash()` added to `build-pipeline.ts`, called after all artifacts written
- `sourceHash` removed from `RouteManifest` (only lives in `BuildMetadata`)
- `buildTimestamp` removed from `RouteManifest` (moved to `BuildMetadata` only) to ensure the manifest is deterministic — same source produces same hash

### Public folder duplication fix (discovered during implementation)

All Vite build calls in the production pipeline used `root: projectRoot` without `publicDir: false`. Vite's default behavior copies `public/` into every build output directory. This caused ~190 images duplicated across `backend/server/` and every `backend/pre-rendered/{route}/` directory.

Fix: added `publicDir: false` to all 5 Vite build calls (server-code-build, server-element-compile x2, instance-client-build, shared-chunks-build). The build pipeline already explicitly copies `public/` to `frontend/public/`.

### Hydration flattening bug fix

Discovered and fixed during this work — see DL#106 "Bug I" for details.
