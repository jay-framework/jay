# createEffect

Creates a side effect that runs after the component renders and cleans up when the component unmounts.

The effect function is called initially on hook creation, as well as if any of the signals it depends on change. 

If the `effect` function returns a cleanup function, the cleanup function is called on component unmount or if 
any of the signal the effect function depends on change, before recalling the effect function.

```typescript
type EffectCleanup = () => void;
declare function createEffect(effect: () => void | EffectCleanup)
```

## Parameters:

* `effect`: A function that returns a cleanup function or undefined.

## example:

```typescript
    createEffect(() => {
    console.log('board', 'pillars:', pillars());
});
```
See the full example in [Scrum Board/lib/board.ts](../../../../examples/jay/scrum-board/lib/board.ts).