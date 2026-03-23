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
        return new WithValidations(undefined, [
            `Failed to parse jay-params YAML: ${e.message}`,
        ]);
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

| Approach | Pros | Cons |
| --- | --- | --- |
| **Explicit jay-params** (chosen) | Clear, no collisions, developer controls | Requires manual declaration |
| **Automatic inference** (current) | Zero config | Complex, collision-prone, invisible |

## Verification Criteria

1. Static override routes with `application/jay-params` get correct `inferredParams`
2. Routes without `application/jay-params` have no `inferredParams` (no automatic inference)
3. Dev server serves override routes with correct params
4. Slow render cache keys correctly with explicit params
5. Existing dynamic routes (`[slug]`) unaffected
