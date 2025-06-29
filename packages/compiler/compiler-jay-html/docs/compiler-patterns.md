# Jay Compiler Patterns

Jay Compiler Patterns are used by jay security module for detecting safe code patterns that can be extracted from
a component file and run in the main context, while the rest of the component runs in a sandbox.

A simple example is the following event handler:

```typescript
refs.cycles.oninput(({ event }: JayEvent<Event, MainViewState>) => {
  const cycles = (event.target as HTMLInputElement).value;
  setCycles(Number(cycles));
});
```

As the event handler can run in a sandbox environment that does not have access to the browser native event,
the code above will break unless is running in the main context `(event.target as HTMLInputElement).value`.

Given the compiler pattern

```typescript
import { JayEvent } from '@jay-framework/runtime';
function inputValuePattern({ event }: JayEvent<any, any>) {
  return event.target.value;
}
```

The event handler is rewritten into

```typescript
refs.cycles.oninput$(handler$('1')).then(({ event }: JayEvent<any, MainViewState>) => {
  setCycles(Number(event.$0));
});
```

while the main context gains

```typescript
const funcRepository: FunctionsRepository = {
  '1': ({ event }: JayEvent<any, any>) => {
    const cycles = (event.target as HTMLInputElement).value;
    return { $0: event.target.value };
  },
};
```

The full example can be found at [mini-benchmark](../../../../examples/jay/mini-benchmark)

## Writing compiler patterns

Jay compiler patterns are written as TS functions. However, those functions are not run directly, instead, they are
compiled into AST patterns that are matched against AST of event handlers and `exec$` APIs.

Pattern matching is checking

1. the access path used for values
2. the input parameter types
3. the output type
4. Compiler patterns are designed to be simple, one liner expressions.
5. A function can contain multiple lines, at which each line is considered a different expression.
6. the `@JayPattern` can be used to force a pattern to only be valid in a certain environment.

Jay supports a number of types of patterns:

## return patterns

A return pattern is a pattern that returns a value, which can be used by the component code (as in the example above).

A return pattern is written as a function that returns a value.

```typescript
import { JayEvent } from '@jay-framework/runtime';

function inputValuePattern(handler: JayEvent<any, any>): string {
  return handler.event.target.value;
}
```

- A return pattern must have a type
- A pattern must have parameter types

> Note: it is not important if we write the pattern using `handler.event.target.value` or
> deconstruct the handler with `{ event }` and write the pattern as `event.target.value` - the AST matching is the same.

## call patterns

A call pattern is a pattern that matches a call to a function.

```typescript
import {JayEvent} from '@jay-framework/runtime';

@JayPattern(JayTargetEnv.main)
function eventPreventDefault(handler: JayEvent<any, any>) {
    handler.event.preventDefault();
}
```

The pattern above allows the call of the native `event.preventDefault()` in the main context.

## chainable call patterns

The combination of a call pattern and a return pattern, allowing to match a sequence of return and call functions.

An example is the string replace function which can run in any environment.

```typescript
@JayPattern(JayTargetEnv.any)
function stringReplace(value: string, regex: RegExp, replacement: string): string {
    return value.replace(regex, replacement)
}
```

> Note: the matching is only on the function body `value.replace(regex, replacement)`. The parameters and return
> are just indications of types and inputs / outputs.

## assignment pattern

Assignment pattern allows to support assignment of values directly in the main context.

An example is the assignment of a string value to an input.

```typescript
import {JayEvent} from '@jay-framework/runtime';

@JayPattern(JayTargetEnv.main)
function setInputValue(handler: JayEvent<any, any>, value: string) {
    handler.event.target.value = value;
}
```

In most cases, the same can be achieved using state management. However, consider the following event handler

```typescript
refs.input.onClick(({ event }) => {
  const inputValue = event.target.value;
  const validValue = inputValue.replace(/[^A-Za-z0-9]+/g, '');
  event.target.value = validValue;
});
```

The combination of assignment, read and chainable call patterns allows to push all of the event handler to the main
context for sync input validation.

## constants

Constants are considered "safe" be definition and if used in patterns are also extracted to the main context.
