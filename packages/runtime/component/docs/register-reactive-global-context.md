# registerReactiveGlobalContext

Creates a reactive context and registers it globally for use across the application.

Use this in `withClient` initialization (via `makeJayInit`) to create reactive global contexts
that are available to all components without needing a parent component to provide them.

```typescript
declare function registerReactiveGlobalContext<T extends object>(
  marker: ContextMarker<T>,
  mkContext: () => T,
): T;
```

## Parameters:

- `marker`: A unique symbol identifying the context, created using `createJayContext`.
- `mkContext`: A function that creates the initial context value.
  The function may use any of the Jay Hooks (`createSignal`, `createEffect`, etc.) and should return an object which represents the context.

## Returns:

The created reactive context value, which can be used immediately in the init function.

## Behavior

- Creates a `Reactive` instance for signal tracking
- Sets up the context creation environment so `createSignal()` and other hooks work
- Returns a proxy that batches reactions for function calls (same as `provideReactiveContext`)
- Registers the context in the global registry so it's available via `useContext()`

## Examples:

### Basic Counter Context

```typescript
import { createJayContext } from '@jay-framework/runtime';
import { createSignal, registerReactiveGlobalContext } from '@jay-framework/component';
import { makeJayInit } from '@jay-framework/fullstack-component';

interface CounterContext {
  count: () => number;
  increment: () => void;
}

export const COUNTER_CTX = createJayContext<CounterContext>();

export const init = makeJayInit().withClient(() => {
  registerReactiveGlobalContext(COUNTER_CTX, () => {
    const [count, setCount] = createSignal(0);
    return {
      count,
      increment: () => setCount((n) => n + 1),
    };
  });
});
```

### Async Initialization Pattern

For contexts that need async initialization, expose an `init()` method:

```typescript
interface WixClientContext {
  client: WixClient;
  isReady: () => boolean;
  init: () => Promise<void>;
}

export const WIX_CLIENT_CTX = createJayContext<WixClientContext>();

export const init = makeJayInit().withClient(async () => {
  const ctx = registerReactiveGlobalContext(WIX_CLIENT_CTX, () => {
    const [isReady, setIsReady] = createSignal(false);

    return {
      client: wixClient,
      isReady,
      async init() {
        const tokens = await wixClient.auth.generateVisitorTokens();
        wixClient.auth.setTokens(tokens);
        setIsReady(true);
      },
    };
  });

  // Call init immediately
  await ctx.init();
});
```

### Using the Context in Components

```typescript
import { useContext } from '@jay-framework/runtime';
import { COUNTER_CTX } from '../lib/init';

function MyComponent(props, refs) {
  // Access the global context
  const counter = useContext(COUNTER_CTX);

  refs.incrementButton.onclick(() => {
    counter.increment();
  });

  return {
    render: () => ({
      count: counter.count(),
    }),
  };
}
```

## Comparison with provideReactiveContext

| Feature       | `provideReactiveContext`                     | `registerReactiveGlobalContext` |
| ------------- | -------------------------------------------- | ------------------------------- |
| Scope         | Component subtree                            | Entire application              |
| When to use   | Component provides context to children       | App initialization              |
| Where to call | Inside component constructor                 | Inside `withClient`             |
| Override      | Child components can provide different value | Cannot be overridden            |

## Design Log

For additional information on the design decisions, read:

- [67 - registerReactiveGlobalContext.md](../../../../design-log/67%20-%20registerReactiveGlobalContext.md)
- [65 - makeJayInit builder pattern.md](../../../../design-log/65%20-%20makeJayInit%20builder%20pattern.md)
