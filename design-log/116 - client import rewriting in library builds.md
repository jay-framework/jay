# Design Log #116 — Client Import Rewriting in Library Builds

## Background

Jay plugins have dual entry points: main (`index.ts`) for server code and `/client` (`index.client.ts`) for browser code. The `jayStackCompiler` plugin handles code splitting — removing server code from client builds and vice versa — but import specifiers pointing to other plugins need rewriting from bare (`@jay-framework/wix-cart`) to client subpath (`@jay-framework/wix-cart/client`).

### Related

- `compiler-jay-stack/lib/plugin-client-import-resolver.ts` — the rewriting plugin
- `compiler-jay-stack/lib/index.ts` — `jayStackCompiler()` orchestration

## Problem

When building a Jay plugin library (e.g., `wix-stores`) with `vite build` (client build, `ssr: false`), bare `@jay-framework/*` imports are **not rewritten** to `/client` subpaths in the output.

**Example output** (`wix-stores/dist/index.client.js`):

```javascript
// Line 1 — correct (manually written as /client in index.client.ts)
import { WIX_CART_CONTEXT } from '@jay-framework/wix-cart/client';

// Line 7 — WRONG (bare import from wix-stores-context.ts, not rewritten)
import { WIX_CART_CONTEXT as WIX_CART_CONTEXT2 } from '@jay-framework/wix-cart';
```

**Source** (`wix-stores-context.ts`):

```typescript
import {
  WIX_CART_CONTEXT,
  type CartState,
  type CartOperationResult as CartResult,
} from '@jay-framework/wix-cart';
```

This file is shared between server and client builds. The bare import is correct for server; needs `/client` for client.

### How it breaks

In the monorepo dev-server, Vite's middleware intercepts imports at serve time, masking the bug. In a standalone project, Vite's dependency pre-bundling (esbuild) follows the bare import into `dist/index.js` (server entry), which contains `module.createRequire` — a Node-only API:

```
Uncaught TypeError: (0, import_module.createRequire) is not a function
```

## Analysis

The existing `createPluginClientImportResolver` used a `transform` hook with regex-based import rewriting. The regex used `.+?` which does not match across newlines, silently skipping multi-line imports like:

```typescript
import { WIX_CART_CONTEXT, type CartState } from '@jay-framework/wix-cart';
```

Single-line imports (manually written as `/client` in `index.client.ts`) worked fine. Multi-line imports (common in shared context files) were silently skipped.

## Design

### Fix the regex in `transform` hook

Change `.+?` to `[\s\S]+?` in both `IMPORT_REGEX` and `EXPORT_FROM_REGEX` to match across newlines.

### Rejected approach: `resolveId` hook

We initially tried replacing `transform` with a `resolveId` hook (`this.resolve()` to re-resolve with `/client` suffix). This approach was theoretically cleaner (no regex needed — Rollup provides each import specifier individually) but caused the Vite dev-server to crash during hydration tests. The `resolveId` hook runs for every import in every module, and even with synchronous `null` returns for non-plugin imports, the added overhead in the Vite dev-server resolution pipeline caused process crashes during test suite execution. The root cause was not fully diagnosed but appeared related to how Vite's dev-server handles plugin hooks during concurrent module resolution.

The `transform` hook approach works reliably because:

- It runs once per file (not per import)
- The regex fix handles multi-line imports correctly
- In dev serve mode, Vite serves the transformed source directly
- In build mode, Rollup processes the transformed source and preserves the rewritten specifiers for externals

## Implementation Plan

### Phase 1: Fix regex

Change `.+?` to `[\s\S]+?` in `IMPORT_REGEX` and `EXPORT_FROM_REGEX`.

### Phase 2: Add multi-line test

Add test case for multi-line import rewriting.

### Phase 3: Verify

1. Build wix-stores client bundle — check output has `/client` imports
2. Run in standalone project — no `createRequire` error
3. Run dev-server tests — no regressions

## Verification Criteria

1. `wix-stores/dist/index.client.js` has `@jay-framework/wix-cart/client` (not bare)
2. Standalone project `yarn dev` loads without `createRequire` error
3. Dev-server tests pass

## Implementation Results

Fixed `IMPORT_REGEX` and `EXPORT_FROM_REGEX` to use `[\s\S]+?` for multi-line matching. Added multi-line import test case.

### Files changed

- `compiler-jay-stack/lib/plugin-client-import-resolver.ts` — fixed regex patterns for multi-line imports
- `compiler-jay-stack/test/plugin-client-import-resolver.test.ts` — added multi-line import test

### Test results

- 61/61 compiler-jay-stack tests pass (including new multi-line test)
- 68/68 packages build successfully
- Dev-server tests pass

### Future: replace regex with AST-based transformation

The regex approach is fragile — it can break on edge cases like import specifiers inside comments, string literals, or unusual formatting. A proper AST-based transformation (e.g., using TypeScript's compiler API or a lightweight parser like `es-module-lexer`) would be more robust. The `resolveId` approach was the ideal solution (no parsing needed at all) but was blocked by Vite dev-server stability issues. If those are resolved upstream, `resolveId` should be revisited.
