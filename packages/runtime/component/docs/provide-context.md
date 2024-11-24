# provideContext

Provides a context value to child components.

A Context created using `provideContext` is injected into child components who declare dependency on it using the same
context `marker`.

This context is not reactive, and any update to the context values will not trigger updates in any components.

- To trigger changes in components as a context changes, use the `provideReactiveContext` hook instead.
- This hook is great for dependency injection into child components.

```typescript
declare function provideContext<ContextType>(
  marker: ContextMarker<ContextType>,
  context: ContextType,
);
```

## Parameters:

- `marker`: A unique symbol identifying the context, created using `createJayContext`.
- `context`: The context value to provide.

## Example

```typescript
const COUNT_CONTEXT = createJayContext<CountContext>();

// in a component constructor
provideContext(COUNT_CONTEXT, context);
```

## design log

For additional information on the design decisions of Jay Context API, read
[16 - context api.md](../../../../design-log/16%20-%20context%20api.md),
[21 - alternative to context API.md](../../../../design-log/21%20-%20alternative%20to%20context%20API.md),
[30 - Jay Context API.md](../../../../design-log/30%20-%20Jay%20Context%20API.md)
