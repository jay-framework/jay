# provideReactiveContext

Provides a reactive context value to child components.

The reactive context is similar to a Jay Component by having it's own Reactive instance, allowing it to use any 
of Jay Hooks (`createSignal`, `createEffect`, etc.) as well as export API functions.

* Child Components who read reactive context signal getters are said to be paired, and changes to such context signals
  will trigger updates of components reading those signal values.
* API functions of reactive context are automatically wrapped by `reactive.batchReactions`.
* Best practice is to update a context using exported API functions as it ensures optimal computation of dependent effects.

```typescript
declare function provideReactiveContext<ContextType extends object>(
    marker: ContextMarker<ContextType>,
    mkContext: () => ContextType,
): ContextType
```

## Parameters:

* `marker`: A unique symbol identifying the context, created using `createJayContext`.
* `mkContext`: A function that creates the initial context value. 
   The function may use any of the Jay Hooks and should return an object which represents the context. 

## Returns:

The created reactive context value.

## Examples:

```typescript
export const SCRUM_CONTEXT = createJayContext<ScrumContext>();
export const provideScrumContext = () =>
    provideReactiveContext(SCRUM_CONTEXT, () => {
        let [pillars, setPillars] = createSignal(DEFAULT_PILLARS);

        const moveTaskToNext = (pillarId: string, taskId: string) => {
            setPillars(moveTask(pillars(), pillarId, taskId, +1, 0));
        };
        const moveTaskToPrev = (pillarId: string, taskId: string) => {
            setPillars(moveTask(pillars(), pillarId, taskId, -1, 0));
        };
        const moveTaskUp = (pillarId: string, taskId: string) => {
            setPillars(moveTask(pillars(), pillarId, taskId, 0, +1));
        };
        const moveTaskDown = (pillarId: string, taskId: string) => {
            setPillars(moveTask(pillars(), pillarId, taskId, 0, -1));
        };

        return {
            pillars,
            moveTaskToNext,
            moveTaskToPrev,
            moveTaskDown,
            moveTaskUp,
        };
    });
```
See the full example in [scrum-context.ts](../../../../examples/jay-context/scrum-board-with-context/lib/scrum-context.ts)

## design log

For additional information on the design decisions of Jay Context API, read
[16 - context api.md](../../../../design-log/16%20-%20context%20api.md),
[21 - alternative to context API.md](../../../../design-log/21%20-%20alternative%20to%20context%20API.md),
[30 - Jay Context API.md](../../../../design-log/30%20-%20Jay%20Context%20API.md)
