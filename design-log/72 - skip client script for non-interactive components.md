# Skip Client Script for Non-Interactive Components

## Background

From Design Logs #49, #52, and #55, Jay Stack components have three rendering phases:

- **Slow**: Build-time or data-change-time rendering
- **Fast**: Request-time rendering
- **Interactive**: Client-side interactivity

A full stack component may not have an interactive phase at all - it could be purely server-rendered with only slow and/or fast phases.

## Problem

When a full stack component doesn't define `.withInteractive()`:

1. The `comp` property on `JayStackComponentDefinition` remains `undefined`
2. In `load-page-parts.ts`, we always generate `clientPart` referencing `page.comp`:
   ```typescript
   clientPart: `{comp: page.comp, contextMarkers: page.contexts || []}`;
   ```
3. The client script is generated with this part
4. In `composite-component.ts` line 62, we call `part.comp(props, partRefs, ...partContexts)`
5. **CRASH**: `TypeError: Cannot read properties of undefined`

**Example of a component without interactive phase:**

```typescript
export const page = makeJayStackComponent<PageContract>()
  .withProps<PageProps>()
  .withServices(DATABASE_SERVICE)
  .withSlowlyRender(async (props, db) => {
    const data = await db.query();
    return partialRender({ data }, {});
  })
  .withFastRender(async (props, slowCF) => {
    return partialRender({ timestamp: Date.now() }, {});
  });
// No .withInteractive() - purely server-rendered!
```

## Analysis

### Current Flow

```
load-page-parts.ts
    │
    ├── Load page component
    │   pageComponent = (await vite.ssrLoadModule(route.compPath)).page
    │
    └── Always add to parts (even if comp is undefined)
        parts.push({
            compDefinition: pageComponent,
            clientImport: `import {page} from '${route.compPath}'`,
            clientPart: `{comp: page.comp, ...}`  // ❌ page.comp may be undefined!
        })
            │
            ▼
generate-client-script.ts
    │
    ├── Generate client script with ALL parts
    │   makeCompositeJayComponent(render, viewState, fastCF, parts)
    │
            │
            ▼
composite-component.ts (browser)
    │
    └── Call part.comp(...) for each part
        part.comp(props, partRefs, ...partContexts)  // ❌ CRASH if undefined!
```

### Where to Fix

**Option A: Filter in `load-page-parts.ts`**

- Don't add parts without `comp` to the parts array
- ✅ Early filtering, clean data
- ⚠️ Still generates client script even if no interactive parts

**Option B: Filter in `generate-client-script.ts`**

- Filter parts before generating script
- Skip script generation entirely if no parts have interactive components
- ✅ Avoids unnecessary client-side JavaScript

**Option C: Handle in `composite-component.ts`**

- Filter out parts where `comp` is undefined
- ✅ Most defensive, handles all edge cases
- ⚠️ Client still loads parts that do nothing

**Recommended: Combination of A + B**

1. In `load-page-parts.ts`: Only add parts with `comp` defined
2. In `generate-client-script.ts`: Check if parts array is empty and handle appropriately

## Design

### Changes to `load-page-parts.ts`

Only add page/headless components to client parts if they have an interactive component:

```typescript
// For page component
const pageComponent = (await vite.ssrLoadModule(route.compPath)).page;

// Always add to parts for server-side rendering
parts.push({
  compDefinition: pageComponent,
  // Only include client import/part if interactive phase exists
  clientImport: pageComponent.comp ? `import {page} from '${route.compPath}'` : undefined,
  clientPart: pageComponent.comp
    ? `{comp: page.comp, contextMarkers: page.contexts || []}`
    : undefined,
});
```

Wait - looking at the current structure, `DevServerPagePart` has both server-side (`compDefinition`) and client-side (`clientImport`, `clientPart`) concerns. Let's trace how these are used.

### Analyzing Current Usage

**Server-side uses:**

- `compDefinition.services` - for service resolution
- `compDefinition.loadParams` - for URL parameter loading
- `compDefinition.slowlyRender` - for slow phase rendering
- `compDefinition.fastRender` - for fast phase rendering

**Client-side uses:**

- `clientImport` - import statement in client script
- `clientPart` - part object in client script

The issue is that `parts` is used for BOTH server-side rendering AND client script generation. A component without interactive phase still needs to be in `parts` for server-side rendering, but should NOT have `clientImport`/`clientPart`.

### Revised Design

**1. Make `clientImport` and `clientPart` optional:**

```typescript
export interface DevServerPagePart {
  compDefinition: AnyJayStackComponentDefinition;
  key?: string;
  clientImport?: string; // Now optional
  clientPart?: string; // Now optional
}
```

**2. Only set client properties if component has interactive phase:**

```typescript
// load-page-parts.ts
const pageComponent = (await vite.ssrLoadModule(route.compPath)).page;
parts.push({
  compDefinition: pageComponent,
  // Only include client properties if there's an interactive component
  ...(pageComponent.comp && {
    clientImport: `import {page} from '${route.compPath}'`,
    clientPart: `{comp: page.comp, contextMarkers: page.contexts || []}`,
  }),
});
```

**3. Filter parts in `generate-client-script.ts`:**

```typescript
// generate-client-script.ts
export function generateClientScript(
    defaultViewState: object,
    fastCarryForward: object,
    parts: DevServerPagePart[],
    ...
) {
    // Filter to only parts with interactive components
    const interactiveParts = parts.filter(part => part.clientImport && part.clientPart);

    // Use interactiveParts instead of parts for client script generation
    const imports = interactiveParts.length > 0
        ? interactiveParts.map((part) => part.clientImport).join('\n') + '\n'
        : '';
    const compositeParts = interactiveParts.length > 0
        ? `[
${interactiveParts.map((part) => '        ' + part.clientPart).join(',\n')}
        ]`
        : '[]';
    // ... rest unchanged
}
```

### What Happens With No Interactive Parts?

When there are no interactive parts:

- `interactiveParts = []`
- `imports = ''`
- `compositeParts = '[]'`
- `makeCompositeJayComponent(render, viewState, fastCarryForward, [])` is called
- In `composite-component.ts`, `parts.map()` returns `[]`, so no component constructors are called

This should work correctly - the page renders with server-side data but has no client-side interactivity.

### Alternative: Skip Client Script Entirely?

Should we skip generating the client script entirely when there are no interactive parts?

**Pros:**

- Smaller page payload
- Faster page load
- No unnecessary JavaScript

**Cons:**

- Need to detect this case in `dev-server.ts` or wherever the client script is injected
- More complex logic

For now, keeping the client script but with an empty parts array is simpler and still works correctly. Future optimization could skip the script entirely.

## Implementation Plan

### Phase 1: Update `load-page-parts.ts`

1. Make `clientImport` and `clientPart` optional in `DevServerPagePart` interface
2. Only set client properties if `pageComponent.comp` is defined
3. Same logic for headless components

### Phase 2: Update `generate-client-script.ts`

1. Filter parts to only those with interactive components
2. Use filtered parts for client script generation

### Phase 3: Test

1. Test component with all phases (slow, fast, interactive)
2. Test component with only slow phase
3. Test component with only fast phase
4. Test component with slow + fast but no interactive
5. Test headless components with/without interactive phase

## Verification Criteria

1. ✅ Components without `.withInteractive()` don't crash the client
2. ✅ Server-side rendering still works for non-interactive components
3. ✅ Components WITH `.withInteractive()` still work correctly
4. ✅ Headless components without interactive phase are handled correctly
5. ✅ No unnecessary JavaScript is loaded for non-interactive components

---

## Implementation Results

**Date**: 2026-01-18

### Why We Chose Client-Side Filtering (Option C)

The original plan was to detect whether a component has an interactive phase on the server side and filter accordingly. However, this approach has a fundamental problem:

**The code splitting plugin (Design Log #52) strips `.withInteractive()` from server builds.**

When we load a component via `ssrLoadModule`, the `jay-stack:code-split` plugin removes the `.withInteractive()` call, so `page.comp` is ALWAYS `undefined` on the server - even for components that DO have an interactive phase.

We considered several workarounds:

1. **Check source file for `.withInteractive(`** - Works for local files, but not for npm packages where the source is compiled/bundled.

2. **Check if package has `/client` export** - A package might have multiple components, some with interactive and some without. The presence of `/client` export doesn't tell us about a specific component.

3. **Add a metadata flag that survives code splitting** - Would require modifying the builder and the code splitting plugin, adding complexity.

**Final Decision**: Handle undefined `comp` on the client side. This is simpler, more robust, and works for all cases (local files, npm packages, any combination).

### Changes Made

1. **`composite-part.ts`** (stack-client-runtime):

   - Made `comp` optional in `CompositePart` interface
   - Added JSDoc explaining why it can be undefined

2. **`composite-component.ts`** (stack-client-runtime):

   - Filter out parts with undefined `comp` at the start:
     ```typescript
     const interactiveParts = parts.filter((part) => part.comp !== undefined);
     ```
   - Use `interactiveParts` instead of `parts` throughout the function

3. **No changes to server-side code** - All parts are still included in the client script, but non-interactive ones are filtered out at runtime.

### Trade-offs

**Pros:**

- ✅ Simple implementation
- ✅ Works for all cases (local files, npm packages)
- ✅ No need to detect interactive phase on server
- ✅ Robust against code splitting transformations

**Cons:**

- ⚠️ Client still imports components that have no interactive phase
- ⚠️ Slightly larger client bundle (includes imports that aren't used)
- ⚠️ Minor runtime overhead from filtering

For future optimization, we could add a build-time analysis pass that detects non-interactive components and excludes them from the client script entirely.

### Test Results

All 62 tests pass in `stack-server-runtime`.
All 13 tests pass in `dev-server`.

### Behavior

When a component has no interactive phase:

- Server-side rendering works normally (slow/fast phases execute)
- Component is still included in client script parts
- On client, `part.comp` is `undefined`
- `makeCompositeJayComponent` filters out parts with undefined `comp`
- No component constructors are called, avoiding the crash
