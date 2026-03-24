# Explicit Route Params for Static Overrides

## Background

DL#69 introduced route priority ordering (static routes match before dynamic). DL#70 added automatic param inference so static override routes like `/products/ceramic-flower-vase` get `{ slug: 'ceramic-flower-vase' }` by matching against sibling dynamic routes like `/products/[slug]`.

The inference logic (`inferParamsForStaticRoutes` in route-scanner.ts) works by:

1. Finding all fully static routes
2. For each, searching for a dynamic sibling route where static segments align
3. Mapping static segment values to param names from the dynamic route

## Problem

The automatic inference is too complex and collision-prone:

- Multiple dynamic routes at different nesting levels can match the same static route
- Catch-all routes (`[...path]`) and optional params (`[[id]]`) add matching ambiguity
- The inference happens at scan time with no visibility to the developer — params appear "magically"
- When routes are reorganized, inference results change silently

## Design

### Explicit params via `<script type="application/jay-params">`

Replace automatic inference with an explicit declaration in the override route's jay-html:

```html
<!-- /products/ceramic-flower-vase/page.jay-html -->
<html>
  <head>
    <script type="application/jay-params">
      slug: ceramic-flower-vase
    </script>
    <script type="application/jay-data" contract="./page.jay-contract"></script>
  </head>
  <body>
    ...
  </body>
</html>
```

The tag body is YAML (consistent with `application/jay-data`). Keys are param names, values are param values.

### Route scanner changes

During `scanDirectory`, when a `page.jay-html` is found:

1. Read the file content
2. Parse `<script type="application/jay-params">` if present
3. Parse the YAML body as `Record<string, string>`
4. Store as `route.inferredParams`

Remove:

- `inferParamsForStaticRoutes()`
- `dynamicRouteCouldMatch()`
- `isFullyStaticRoute()`
- `hasDynamicSegments()`
- `ParamInferenceResult` type
- The inference logging at lines 289-297

### What stays the same

- `JayRoute.inferredParams` field — same type, same usage
- Dev server merge: `{ ...route.inferredParams, ...req.params }` — unchanged
- Slow render cache keying with params hash — unchanged
- `loadParams` validation — unchanged
- Route priority sorting — unchanged

### Parsing approach

Add a `parseJayHtmlHead` utility that uses `node-html-parser` (same HTML parser as `parseJayFile`, `slowRenderTransform`, and `assignCoordinates`) to extract metadata from jay-html `<head>` script tags. This is lighter than the full `parseJayFile` (which does type analysis, contract loading, etc.) but uses a real parser — no fragile regex.

Returns `WithValidations<T>` to report errors (duplicate tags, YAML parse failures).

```typescript
import { parse } from 'node-html-parser';
import YAML from 'yaml';
import { WithValidations } from '@jay-framework/compiler-shared';

/**
 * Parse a jay-html file's <head> and extract <script type="application/jay-params"> content.
 * Uses the same HTML parser as the compiler (node-html-parser).
 */
export function parseJayParams(
  jayHtmlContent: string,
): WithValidations<Record<string, string> | undefined> {
  const root = parse(jayHtmlContent, {
    comment: true,
    blockTextElements: { script: true, style: true },
  });
  const head = root.querySelector('head');
  if (!head) return new WithValidations(undefined, []);

  const paramScripts = head.querySelectorAll('script[type="application/jay-params"]');
  if (paramScripts.length === 0) return new WithValidations(undefined, []);
  if (paramScripts.length > 1) {
    return new WithValidations(undefined, [
      'Multiple <script type="application/jay-params"> tags found — expected at most one',
    ]);
  }

  const body = paramScripts[0].textContent?.trim();
  if (!body) return new WithValidations(undefined, []);

  try {
    return new WithValidations(YAML.parse(body), []);
  } catch (e) {
    return new WithValidations(undefined, [`Failed to parse jay-params YAML: ${e.message}`]);
  }
}
```

The route scanner already reads the filesystem (`fs.readdir`). Adding `fs.readFile` for each `page.jay-html` during scan is minimal overhead — routes are scanned once at dev server startup.

## Implementation Plan

### Phase 1: Add jay-params parsing to route scanner

1. Add `parseJayParams` function in route-scanner (uses `node-html-parser` + `yaml` + `WithValidations`)
2. In `scanDirectory`, read `page.jay-html` content when found
3. Call `parseJayParams`, set `route.inferredParams` from parsed values, log validations
4. Remove `inferParamsForStaticRoutes` and related functions (`dynamicRouteCouldMatch`, `isFullyStaticRoute`, `hasDynamicSegments`, `ParamInferenceResult`)

### Phase 2: Update tests

1. Update route-scanner tests to use `application/jay-params` instead of inference
2. Add test for missing jay-params (no inferredParams)
3. Add test for duplicate jay-params tags (validation error)
4. Add test for invalid YAML in jay-params (validation error)

### Phase 3: Update examples and docs

1. Update static override routes in examples to use `application/jay-params`
2. Docs to update:
   - `docs/core/jay-html.md` — add `application/jay-params` to jay-html file structure
   - `docs/core/jay-stack.md` — add static override route params to "URL Parameter Loading" section (line 621)
   - `packages/jay-stack/stack-cli/agent-kit-template/jay-html-syntax.md` — add `application/jay-params` to file structure section
   - `packages/jay-stack/stack-cli/agent-kit-template/INSTRUCTIONS.md` — add guidance for static override routes
   - `packages/jay-stack/route-scanner/README.md` — document `inferredParams` from `jay-params` tag

## Examples

### ✅ Static override with explicit params

```
src/pages/
  products/
    [slug]/
      page.jay-html        ← dynamic route
      page.ts
    ceramic-flower-vase/
      page.jay-html         ← override with <script type="application/jay-params">
      page.ts
```

```html
<!-- ceramic-flower-vase/page.jay-html -->
<script type="application/jay-params">
  slug: ceramic-flower-vase
</script>
```

### ✅ Multiple params

```html
<!-- category/furniture/page.jay-html (override for /[category]/[subcategory]) -->
<script type="application/jay-params">
  category: home
  subcategory: furniture
</script>
```

### ✅ No params (regular static route)

No `application/jay-params` tag needed. `inferredParams` is undefined. Same as today for routes without dynamic siblings.

## Trade-offs

| Approach                          | Pros                                     | Cons                                |
| --------------------------------- | ---------------------------------------- | ----------------------------------- |
| **Explicit jay-params** (chosen)  | Clear, no collisions, developer controls | Requires manual declaration         |
| **Automatic inference** (current) | Zero config                              | Complex, collision-prone, invisible |

## Verification Criteria

1. Static override routes with `application/jay-params` get correct `inferredParams`
2. Routes without `application/jay-params` have no `inferredParams` (no automatic inference)
3. Dev server serves override routes with correct params
4. Slow render cache keys correctly with explicit params
5. Existing dynamic routes (`[slug]`) unaffected

## Follow-up: Validate Route Params

### Problem

Pages can use contracts (page contract, headless components, headfull FS components) that declare `params`. The route directory must provide all required params. Currently there's no validation — a page at a static route using a contract that expects `slug` produces no error.

### Design

Add validation to `validateJayFiles` in stack-cli that checks route params against contract params.

**Param sources on a page** (from `parseJayFile` result):

- `parsedFile.contract?.params` — page's own contract params
- `parsedFile.headlessImports[i].contract?.params` — headless + headfull FS component params

**Route params available** — extracted from file path relative to `pagesBase`:

- `[slug]` → required param `slug`
- `[[lang]]` → optional param `lang`
- `[...path]` → catch-all param `path`
- `jay-params` in the jay-html `<head>` also provide params

**Rule**: Every param name declared in any contract on the page must be provided by either a dynamic route segment OR explicit `jay-params`. Missing params emit a **warning** (not error) — the component may handle missing params gracefully.

### Implementation

Three new functions in `validate.ts`:

- `extractRouteParams(filePath, pagesBase)` — regex-match path segments for `[param]` patterns
- `extractJayParams(content)` — parse `<script type="application/jay-params">` from raw HTML
- `checkRouteParams(parsedFile, filePath, pagesBase, content)` — collect contract params, compare against available params, return warning messages

Also update `printJayValidationResult` to print warnings.

## Follow-up: Extend Contract Params with Optional and Catch-All

### Problem

`ContractParam` currently only has `{ name: string }`. All params are implicitly required. But routes support three param kinds:

- `[slug]` — required, always present
- `[[lang]]` — optional, may be undefined
- `[...path]` — catch-all, captures remaining path segments

The contract has no way to express this, which means:

1. The generated `Params` type always marks every param as required `string` — no `?` for optional
2. Validation can't distinguish "this param must exist" from "this param is nice to have"
3. Catch-all params have no type-level representation

### Design

#### YAML syntax

Use TypeScript-like type annotations in the value field (currently ignored):

```yaml
params:
  slug: string # required
  lang: string? # optional
  path: string[] # catch-all
```

`string` = required (backwards-compatible). `string?` = optional. `string[]` = catch-all.

#### `ContractParam` type

```typescript
export type ContractParamKind = 'required' | 'optional' | 'catch-all';

export interface ContractParam {
  name: string;
  kind: ContractParamKind;
}
```

#### Parser changes (`contract-parser.ts`)

```typescript
// Current:
parsedParams = Object.keys(parsedYaml.params).map((name) => ({ name }));

// New:
parsedParams = Object.entries(parsedYaml.params).map(([name, value]) => ({
  name,
  kind:
    typeof value === 'string' && value.endsWith('?')
      ? 'optional'
      : typeof value === 'string' && value.endsWith('[]')
        ? 'catch-all'
        : 'required',
}));
```

#### Type generation changes (`contract-compiler.ts`)

```typescript
// Current: all params are required string
params.map((param) => `  ${camelCase(param.name)}: string;`);

// New: optional gets ?, catch-all gets string[]
params.map((param) => {
  const name = camelCase(param.name);
  if (param.kind === 'optional') return `  ${name}?: string;`;
  if (param.kind === 'catch-all') return `  ${name}: string[];`;
  return `  ${name}: string;`;
});
```

#### Validation changes (`validate.ts`)

Update `checkRouteParams` to only warn for `required` params missing from the route. `optional` params don't trigger warnings. `catch-all` params only match `[...name]` route segments.

### Files to modify

1. `packages/compiler/compiler-jay-html/lib/contract/contract.ts` — add `ContractParamKind`, update `ContractParam`
2. `packages/compiler/compiler-jay-html/lib/contract/contract-parser.ts` — parse value as kind
3. `packages/compiler/compiler-jay-html/lib/contract/contract-compiler.ts` — generate `?` for optional
4. `packages/jay-stack/stack-cli/lib/validate.ts` — skip optional params in warnings
5. Tests for parser, compiler, and validation

## Follow-up: Skip loadParams Validation in Dev Server

### Problem

On the first request to a route in the dev server, `loadParams` blocks page serving because it must load ALL valid param combinations before validating even one request. If the underlying API is slow, this causes multi-second delays (observed: 38 seconds) on first page load.

The `loadParams` flow:
1. Request arrives for `/products/ceramic-vase`
2. `runSlowlyForPage` calls `loadParams` → queries API for ALL valid product slugs
3. Waits for full enumeration to complete (38s)
4. Validates that `ceramic-vase` is in the list
5. Only then runs `slowlyRender`

This is wasteful — `slowlyRender` already receives `pageParams` and can return `notFound()` if the params are invalid.

### Design

**Remove loadParams validation from `DevSlowlyChangingPhase.runSlowlyForPage()`.**

The render hooks (`slowlyRender`, `fastRender`) already receive `pageParams` from the URL and can return `notFound()` for invalid params. This makes loadParams validation redundant for dev serving.

`loadParams` remains in the component builder API (`withLoadParams`) for future SSG enumeration, where knowing all valid params IS the goal.

### Changes

#### `packages/jay-stack/stack-server-runtime/lib/slowly-changing-runner.ts`

Remove from `DevSlowlyChangingPhase`:
- The `loadParamsCache` field
- The loadParams validation block in `runSlowlyForPage` (lines 63–105)
- The `invalidateLoadParamsCache` method

#### `packages/jay-stack/dev-server/lib/dev-server.ts`

Remove from `setupSlowRenderCacheInvalidation`:
- All `slowlyPhase.invalidateLoadParamsCache(...)` calls (3 occurrences)
- The `slowlyPhase` parameter (no longer needed)

### What stays

- `withLoadParams()` builder method on `makeJayStackComponent` — API unchanged
- `loadParams` field on `JayStackComponentDefinition` — preserved for SSG
- `runLoadParams` standalone function — preserved for SSG

### Trade-offs

| | With loadParams validation | Without (proposed) |
|---|---|---|
| **First request latency** | Blocked by full enumeration | Immediate — render handles it |
| **Invalid param handling** | Early 404 before render | 404 from slowRender |
| **Per-request cost (valid)** | Cache lookup (cheap) | None (skipped) |
| **Per-request cost (invalid)** | Cache lookup → 404 | Full render → 404 (slightly more expensive) |

The trade-off is clear: saving 38s on first load far outweighs the slightly more expensive 404 path for invalid params (which is rare in dev).
