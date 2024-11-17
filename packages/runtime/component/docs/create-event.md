# createEvent

Creates a Jay component event emitter.

Jay, unlike React or Solid.js, does not accept callbacks as props. Instead, the component constructor function has to 
return as part of the returned object event emitters. The `createEvent` function is used to create those event emitters.

The event emitter itself is a function to register `JayEventHandler`s and has a member to `emit` events.

`createEvent` can optionally accept an effect function that can be used to create an effect to emit an event
whenever the signals it depends on change.

```typescript
interface EventEmitter<EventType, ViewState> {
    (handler: JayEventHandler<EventType, ViewState, void>): void;
    emit: (event?: EventType) => void;
}

declare function createEvent<EventType>(
    eventEffect?: (emitter: EventEmitter<EventType, any>) => void,
): EventEmitter<EventType, any>
```

## Parameters:

* `eventEffect`: An optional effect to run when the event is emitted.

## Returns:

An event emitter object.

## Examples:

A simple event emitter:

```typescript
function TaskConstructor(props: Props<TaskProps>, refs: TaskElementRefs) {
    let onNext = createEvent();
    let onPrev = createEvent();
    let onUp = createEvent();
    let onDown = createEvent();

    refs.next.onclick(() => onNext.emit());
    refs.up.onclick(() => onUp.emit());
    refs.down.onclick(() => onDown.emit());
    refs.prev.onclick(() => onPrev.emit());

    return {
        render: () => props,
        onNext,
        onDown,
        onUp,
        onPrev,
    };
}
```
See the full example in [Scrum Board/lib/task.ts](../../../../examples/jay/scrum-board/lib/task.ts).

An event emitter with `eventEffect`:

```typescript
function CounterComponent({}: Props<CounterProps>, refs: CounterRefs) {
    let [value, setValue] = createSignal(0);
    refs.inc.onclick(() => setValue(value() + 1));
    refs.dec.onclick(() => setValue(value() - 1));
    let onChange = createEvent<CounterChangeEvent>((emitter) =>
        emitter.emit({ value: value() }),
    );
    return {
        render: () => ({ value }),
        onChange,
    };
}
```
See the full example in [component.test.ts](../test/component.test.ts).
