# Automation Dev Server Integration

## Background

Design Log #76 introduced `@jay-framework/runtime-automation` for programmatic UI interaction. The package provides:

- `wrapWithAutomation(component)` - wraps a component with automation API
- `getPageState()` - get current ViewState and interactions
- `triggerEvent(eventType, coordinate)` - trigger events on elements
- `onStateChange(callback)` - subscribe to state changes

Currently, automation must be manually integrated by importing and wrapping components.

## Problem

1. **No automatic dev server integration** - Developers must manually add automation to use it in dev mode
2. **No standard way for plugins to access automation** - Plugins like testing tools, accessibility checkers, or AI assistants cannot easily access the automation API

## Questions and Answers

### Q1: Should automation always load in dev server?

**Answer:** Yes, in dev mode. Automation adds minimal overhead and is useful for:

- Browser console debugging
- Plugin integrations (testing, accessibility, AI)
- Developer tooling

In production builds, it should be optional/tree-shakeable.

### Q2: How should plugins access the automation API?

**Answer:** Via a global context. This follows the existing pattern:

```typescript
import { useContext } from '@jay-framework/runtime';
import { AUTOMATION_CONTEXT } from '@jay-framework/runtime-automation';

// In plugin or component
const automation = useContext(AUTOMATION_CONTEXT);
automation.getPageState();
```

### Q3: Should the automation be exposed on `window` for console access?

**Answer:** Yes, for dev mode convenience:

```javascript
// Browser console
window.__jay.automation.getPageState();
window.__jay.automation.triggerEvent('click', ['addBtn']);
```

## Design

### 1. Export Context from runtime-automation

```typescript
// lib/automation-context.ts
import { createJayContext } from '@jay-framework/runtime';
import type { AutomationAPI } from './types';

export const AUTOMATION_CONTEXT = createJayContext<AutomationAPI>();
```

### 2. Dev Server Integration

The dev server already generates client scripts via `generateClientScript`. We add automation initialization:

```typescript
// In generated client script
import { wrapWithAutomation, AUTOMATION_CONTEXT } from '@jay-framework/runtime-automation';
import { registerGlobalContext } from '@jay-framework/runtime';

// After component creation
const instance = pageComp({ ...viewState, ...fastCarryForward });
const wrapped = wrapWithAutomation(instance);

// Register as global context for plugins
registerGlobalContext(AUTOMATION_CONTEXT, wrapped.automation);

// Expose on window for console access
window.__jay = window.__jay || {};
window.__jay.automation = wrapped.automation;

target.appendChild(wrapped.element.dom);
```

### 3. Option to Disable

Add option in dev server config:

```typescript
interface DevServerOptions {
  // ... existing
  /** Disable automation integration (default: false in dev) */
  disableAutomation?: boolean;
}
```

### 4. Stack Client Runtime Export

Export a helper from `@jay-framework/stack-client-runtime` for consistency:

```typescript
// In stack-client-runtime
export {
  wrapWithAutomation,
  AUTOMATION_CONTEXT,
  type AutomationAPI,
} from '@jay-framework/runtime-automation';
```

## Data Flow

```mermaid
flowchart TB
    subgraph DevServer["Dev Server (generates client script)"]
        GEN[generateClientScript]
    end

    subgraph ClientScript["Generated Client Script"]
        COMP[Create Page Component]
        WRAP[wrapWithAutomation]
        REG[registerGlobalContext<br/>AUTOMATION_CONTEXT]
        WIN[window.__jay.automation]
        MOUNT[Mount to DOM]

        COMP --> WRAP --> REG --> WIN --> MOUNT
    end

    subgraph Plugins["Plugins / Components"]
        USE[useContext<br/>AUTOMATION_CONTEXT]
    end

    subgraph Console["Browser Console"]
        CONSOLE[window.__jay.automation]
    end

    GEN -->|"includes automation"| ClientScript
    REG --> USE
    WIN --> CONSOLE
```

## Implementation Plan

### Phase 1: Add Context Export

1. Create `AUTOMATION_CONTEXT` in `runtime-automation/lib/automation-context.ts`
2. Export from `runtime-automation/lib/index.ts`
3. Add test for context usage

### Phase 2: Update generateClientScript

1. Add `enableAutomation` parameter to `generateClientScript`
2. Generate automation wrapper code when enabled
3. Register global context
4. Expose on `window.__jay`

### Phase 3: Update Dev Server

1. Add `disableAutomation` option to `DevServerOptions`
2. Pass `enableAutomation: true` by default in dev mode
3. Update tests

### Phase 4: Re-export from stack-client-runtime

1. Re-export automation types and context from `stack-client-runtime`
2. Update docs

## Examples

### Plugin Using Automation Context

```typescript
// accessibility-plugin/lib/init.ts
import { makeJayInit } from '@jay-framework/fullstack-component';
import { AUTOMATION_CONTEXT } from '@jay-framework/stack-client-runtime';

export const init = makeJayInit().withClient(() => {
  // Wait for automation to be ready
  setTimeout(() => {
    const automation = useContext(AUTOMATION_CONTEXT);
    if (automation) {
      runAccessibilityCheck(automation);
    }
  }, 0);
});

function runAccessibilityCheck(automation: AutomationAPI) {
  const state = automation.getPageState();
  for (const interaction of state.interactions) {
    // Check each interactive element
    if (!interaction.element.getAttribute('aria-label')) {
      console.warn(`Missing aria-label: ${interaction.refName}`);
    }
  }
}
```

### Browser Console Usage

```javascript
// View current state
window.__jay.automation.getPageState();

// List all interactions
window.__jay.automation.getPageState().interactions.map((i) => i.refName);

// Trigger a click
window.__jay.automation.triggerEvent('click', ['addToCartBtn']);

// Watch state changes
window.__jay.automation.onStateChange((s) => console.log('State:', s.viewState));
```

### Component Using Automation

```typescript
// dev-tools-panel.ts
function DevToolsPanel(props, refs, automation: AutomationAPI) {
  const [interactions, setInteractions] = createSignal<Interaction[]>([]);

  automation.onStateChange((state) => {
    setInteractions(state.interactions);
  });

  return {
    render: () => ({
      interactions: interactions(),
    }),
  };
}

export const DevTools = makeJayComponent(render, DevToolsPanel, AUTOMATION_CONTEXT);
```

## Trade-offs

### Always Loading vs Opt-in

**Always loading in dev (chosen):**

- ✅ Zero config for common case
- ✅ Plugins can assume it's available in dev
- ✅ Console debugging always works
- ❌ Slightly larger dev bundle

**Opt-in:**

- ✅ Smaller bundle if not used
- ❌ More config needed
- ❌ Plugins can't rely on it

### Global Window vs Only Context

**Both (chosen):**

- ✅ Console access for debugging
- ✅ Type-safe access via context for plugins
- ❌ Two access patterns

**Only context:**

- ✅ Cleaner, type-safe only
- ❌ Harder to use from console

## Files to Modify

- `jay/packages/runtime/runtime-automation/lib/automation-context.ts` (new)
- `jay/packages/runtime/runtime-automation/lib/index.ts`
- `jay/packages/jay-stack/stack-server-runtime/lib/generate-client-script.ts`
- `jay/packages/jay-stack/dev-server/lib/dev-server.ts`
- `jay/packages/jay-stack/stack-client-runtime/lib/index.ts`

---

## Implementation Results

### Phase 1-4: All Completed

**Files Created/Modified:**

1. **`runtime-automation/lib/automation-context.ts`** (new)

   - Created `AUTOMATION_CONTEXT` using `createJayContext<AutomationAPI>()`

2. **`runtime-automation/lib/automation-agent.ts`**

   - Updated `AutomationAgent` constructor to accept optional `initialViewState`
   - When provided, stores merged slow+fast ViewState for `getPageState()`
   - Updates merged state on each `viewStateChange` event

3. **`runtime-automation/lib/index.ts`**

   - Added export for `AUTOMATION_CONTEXT`

4. **`stack-server-runtime/lib/generate-client-script.ts`**

   - Added `slowViewState` option to `GenerateClientScriptOptions`
   - When `slowViewState` provided, generates code to merge with fast ViewState
   - Passes merged state to `wrapWithAutomation(instance, fullViewState)`

5. **`dev-server/lib/dev-server-options.ts`**

   - Added `disableAutomation?: boolean` option

6. **`dev-server/lib/dev-server.ts`**

   - Updated `sendResponse` to accept optional `slowViewState` parameter
   - Cached request handler passes `cachedEntry.slowViewState`
   - Pre-render request handler passes `renderedSlowly.rendered`
   - Direct request handler (no caching) doesn't pass slowViewState (full merge happens server-side)

7. **`stack-client-runtime/package.json`**

   - Added `@jay-framework/runtime-automation` dependency

8. **`stack-client-runtime/lib/index.ts`**
   - Re-exports `wrapWithAutomation`, `AUTOMATION_CONTEXT`, and related types

### Slow ViewState Merge for Automation

**Problem:** When slow rendering is enabled (Design Log #75), slow ViewState is baked into the pre-rendered jay-html and not sent to the client. Only fast ViewState is sent. But automation/AI tools need to see the complete page state.

**Solution:** Pass slow ViewState separately to the generated client script. When automation is enabled, use `deepMergeViewStates` with `trackByMap` to properly merge arrays by their track-by keys:

```typescript
// Generated client code (when slowViewState provided)
import { deepMergeViewStates } from '@jay-framework/view-state-merge';

const slowViewState = {
  products: [
    { id: '1', name: 'Widget A' },
    { id: '2', name: 'Widget B' },
  ],
};
const viewState = {
  products: [
    { id: '1', price: 29.99 },
    { id: '2', price: 19.99 },
  ],
};
const trackByMap = { products: 'id' };
// ...
const fullViewState = deepMergeViewStates(
  slowViewState,
  { ...viewState, ...fastCarryForward },
  trackByMap,
);
const wrapped = wrapWithAutomation(instance, fullViewState);
```

This ensures arrays are merged by their track-by key (e.g., `id`), not replaced entirely.

**Data Flow:**

```
Dev Server Request with Slow Render Caching:
┌──────────────────────────────────────────────────────────────┐
│ 1. Cache hit: cachedEntry contains slowViewState             │
│ 2. Run fast phase: produces fastViewState                    │
│ 3. generateClientScript receives both:                       │
│    - viewState = fastViewState (sent to component)           │
│    - slowViewState = cachedEntry.slowViewState (for automation)
│ 4. Generated script:                                         │
│    - Component renders with fastViewState                    │
│    - Automation API gets merged slow+fast ViewState          │
└──────────────────────────────────────────────────────────────┘
```

### Tests

- All 35 runtime-automation tests pass
- All 66 stack-server-runtime tests pass
- All 13 dev-server tests pass
- Full `yarn confirm` passes

### Verification

```javascript
// Browser console in dev mode with slow rendering
const state = window.__jay.automation.getPageState();
console.log(state.viewState);
// Shows: { products: [{ id: "1", name: "Widget A", price: 29.99 }, { id: "2", name: "Widget B", price: 19.99 }] }
// (deep merged by trackBy key - slow properties like 'name' merged with fast properties like 'price')
```

### Automation Agent Deep Merge with trackByMap

**Change:** Updated `wrapWithAutomation` to accept an options object instead of just `initialViewState`:

```typescript
// Before
wrapWithAutomation(instance, fullViewState);

// After
wrapWithAutomation(instance, { initialViewState: fullViewState, trackByMap });
```

**New interface:**

```typescript
interface AutomationAgentOptions {
  initialViewState: object;
  trackByMap: TrackByMap;
}
```

**Automation agent now uses `deepMergeViewStates` in two places:**

1. **In constructor** - Immediately merges `initialViewState` with `component.viewState` to capture any properties computed during hydration (e.g., `star1: false` that wasn't in the initial script but was computed during component initialization)

2. **On viewStateChange** - Re-merges base state with updated `component.viewState` using `trackByMap`

**Bug fixed:** Previously, properties computed during component hydration (between script generation and automation agent creation) were missing from `mergedViewState` until the next `viewStateChange` event. The constructor now does an initial merge to capture these.

**Generated client code:**

```typescript
const fullViewState = deepMergeViewStates(
  slowViewState,
  { ...viewState, ...fastCarryForward },
  trackByMap,
);
const wrapped = wrapWithAutomation(instance, { initialViewState: fullViewState, trackByMap });
```

**Tests added:** `view-state-merge` tests for falsy values (`false`, `null`, `0`, `''`) to verify they're correctly merged.
