# registerReactiveGlobalContext

## Background

Design Log #65 introduced `registerGlobalContext` for registering app-wide contexts during initialization via `makeJayInit()`. However, this only supports static contexts - the value is stored as-is without reactivity.

For component-provided contexts, we have:
- `provideContext(marker, value)` - static context
- `provideReactiveContext(marker, mkContext)` - reactive context with signals

The reactive version uses `createReactiveContext()` which:
1. Creates a `Reactive` instance for signal tracking
2. Sets up `CONTEXT_CREATION_CONTEXT` so `createSignal()` works inside the factory
3. Returns a proxy that batches reactions for function calls

## Problem

There's no equivalent for global contexts. When using `registerGlobalContext` in `withClient`, signals created inside the context factory won't work because there's no reactive system set up.

```typescript
// ❌ Won't work - signals have no reactive system
export const init = makeJayInit()
  .withClient(() => {
    const [count, setCount] = createSignal(0); // Error: no reactive context
    registerGlobalContext(COUNTER_CTX, { count, setCount });
  });
```

## Design

Add `registerReactiveGlobalContext` to `@jay-framework/component`:

```typescript
export function registerReactiveGlobalContext<T extends object>(
  marker: ContextMarker<T>,
  mkContext: () => T,
): T
```

### Behavior

1. Creates a `Reactive` instance via `mkReactive('global-ctx', marker.description)`
2. Sets up `CONTEXT_CREATION_CONTEXT` with:
   - The reactive instance
   - `mountedSignal` initialized to `true` (always mounted)
   - Empty `provideContexts` (not used for global contexts)
3. Calls the factory function within this context
4. Wraps result in a proxy that batches reactions
5. Calls `registerGlobalContext(marker, wrappedContext)`
6. Returns the wrapped context (useful for accessing in the same init)

### Usage

```typescript
// ✅ Works - signals have reactive system
import { registerReactiveGlobalContext } from '@jay-framework/component';

export const init = makeJayInit()
  .withClient(() => {
    registerReactiveGlobalContext(COUNTER_CTX, () => {
      const [count, setCount] = createSignal(0);
      return { count, setCount, increment: () => setCount(n => n + 1) };
    });
  });
```

### Implementation Location

`@jay-framework/component/lib/context-api.ts` - co-located with `createReactiveContext`

This makes sense because:
- Already has `createReactiveContext` logic
- Has access to `CONTEXT_CREATION_CONTEXT`
- `component` package depends on both `reactive` and `runtime`

### Code

```typescript
// In component/lib/context-api.ts

export function registerReactiveGlobalContext<T extends object>(
  marker: ContextMarker<T>,
  mkContext: () => T,
): T {
  const context = createReactiveContext(mkContext);
  registerGlobalContext(marker, context);
  return context;
}
```

This is simple because `createReactiveContext` already does all the heavy lifting.

## Implementation Plan

### Phase 1: Add the function

1. Add `registerReactiveGlobalContext` to `component/lib/context-api.ts`
2. Export from `component/lib/index.ts`
3. Add tests

### Phase 2: Update documentation

1. Update `packages/runtime/component/docs/` with `registerReactiveGlobalContext` usage
2. Update `docs/core/components.md` with global reactive context section

### Phase 3: Update wix-server-client example

Update the example in `wix/packages/wix-server-client` to use reactive global context if needed.

## Examples

### Counter Context

```typescript
// lib/contexts/counter.ts
export interface CounterContext {
  count: Getter<number>;
  increment: () => void;
}
export const COUNTER_CTX = createJayContext<CounterContext>();

// lib/init.ts
export const init = makeJayInit()
  .withClient(() => {
    registerReactiveGlobalContext(COUNTER_CTX, () => {
      const [count, setCount] = createSignal(0);
      return {
        count,
        increment: () => setCount(n => n + 1),
      };
    });
  });
```

### Wix Client Context (Reactive)

```typescript
export const init = makeJayInit()
  .withClient(async () => {
    await registerReactiveGlobalContext(WIX_CLIENT_CONTEXT, () => {
      const [isReady, setIsReady] = createSignal(false);
      const [tokens, setTokens] = createSignal<Tokens | null>(null);
      
      return {
        client: wixClient,
        isReady,
        tokens,
        async initialize() {
          const newTokens = await wixClient.auth.generateVisitorTokens();
          setTokens(newTokens);
          setIsReady(true);
        },
      };
    });
  });
```

## Trade-offs

### Return Value

**Option A: Return the context (proposed)**
- ✅ Allows using the context immediately in init
- ✅ Consistent with `provideReactiveContext` which also returns the context

**Option B: Return void (like `registerGlobalContext`)**
- ✅ Consistent with `registerGlobalContext`
- ❌ Need to use `useContext` to access, which may not be set up yet

Going with Option A for flexibility.

## Questions

### Q1: Should this be async-capable?

**Answer:** No. The function is sync. Contexts that need async initialization should expose an `init()` method (or similar). This keeps the API simple and works well with hooks.

```typescript
registerReactiveGlobalContext(CTX, () => {
  const [ready, setReady] = createSignal(false);
  
  return {
    ready,
    async init() {
      await doAsyncWork();
      setReady(true);
    },
  };
});

// In withClient:
const ctx = registerReactiveGlobalContext(CTX, () => ...);
await ctx.init();
```
