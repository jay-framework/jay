# building the code splitting compiler

Resources:

# Typescript

how to write a plugin for Typescript compiler, to replace or update code
[How to Write a TypeScript Transform (Plugin)](https://dev.doctorevidence.com/how-to-write-a-typescript-transform-plugin-fc5308fdd943)

[List of typescript transform resources](https://github.com/itsdouges/awesome-typescript-ecosystem)

[TypeScript Transformer Handbook](https://github.com/itsdouges/typescript-transformer-handbook)
how to write a typescript transformer

The handbook is based on the deprecated library [`ttypescript`](https://github.com/cevek/ttypescript).
It points to ['ts-patch'](https://github.com/nonara/ts-patch) as a better alternative.

Good example of a simple typescript plugin [ts-transform-json](https://github.com/longlho/ts-transform-json/blob/master/compile.ts).

[Using TypeScript transforms to enrich runtime code](https://blog.logrocket.com/using-typescript-transforms-to-enrich-runtime-code-3fd2863221ed/)
another resource on how to write typescript transformer

Typescript language plugins can be used to provide additional Jay specific messages during Typescript compile time
[tsconfig plugins](https://www.typescriptlang.org/tsconfig#plugins).

# Rust

Creating typescript from Rust
[ctaggart/create_source.rs](https://gist.github.com/ctaggart/1d2f4b9155de35ee78e566784e336dcb)

SWC - Rust typescript compiler [@swc/core](https://swc.rs/docs/usage/core)

# ESBuild - fast bundler in go [esbuild](https://esbuild.github.io/)

ESBuild has the [on-load](https://esbuild.github.io/plugins/#on-load) plugin callback which can be used to generate files
when loading an imported file. Can be used for generating the Jay files.

ESBuild does not seem to have typescript engine written in go that can used natively. It can use typescript engine in JS.

# Volar.js

https://volarjs.dev/
toolset for language services and building custom source files, such as for Vue or Astro.
can be used for the data part of a jay file.

# TS-SQL
https://github.com/codemix/ts-sql/tree/master/src
typescript library that uses TS type string matching to parse SQL strings and extract types from.
seems very similar to the data part of a jay file.

# more link

https://github.com/AviVahl/ts-tools

https://ts-ast-viewer.com/

## The required transformations

# Function splitting by pattern matching

### Example 1 - keycode and prevent default example

```typescript
const ENTER_KEY = 13;
refs.newTodo.onkeydown(({ event }) => {
  if (event.keyCode === ENTER_KEY) {
    event.preventDefault();
    //... rest code
  }
});
```

to be transformed into
worker:

```typescript
const ENTER_KEY = 13;
refs.newTodo.onkeydown(({ event: { keyCode } }) => {
  if (keyCode === ENTER_KEY) {
    //... rest code
  }
});
```

main thread:

```typescript
const ENTER_KEY = 13;
export const funcRepository: FunctionsRepository = {
  //... rest of function repository functions
  '3': ({ event }: JayEvent<KeyboardEvent, any>) => {
    if (event.keyCode === ENTER_KEY) event.preventDefault();
    return event.keyCode;
  },
};
```

### Example 2 - input value

```typescript
refs.newTodo.oninput(({ event }) => {
  setNewTodo((event.target as HTMLInputElement).value);
});
```

to be transformed into
worker:

```typescript
const ENTER_KEY = 13;
refs.newTodo.onkeydown(({ event: { value } }) => {
  setNewTodo(value);
});
```

main thread:

```typescript
const ENTER_KEY = 13;
export const funcRepository: FunctionsRepository = {
  //... rest of function repository functions
  '3': ({ event }: JayEvent<InputEvent, any>) => {
    return event.target.value;
  },
};
```

## Trying to define the transformers

In this section we try the first draft of defining the transformation rules to take "code" from patterns and extract it
from event handlers and `exec$` API into the main thread.

We define a process of a few stages for the pattern matching and replacement

# 1 - Function Pattern Matching

We define the **Function Pattern Matching** as a typescript function, which is used as a matching pattern, such as below.
We define **Safe Code Pattern** as a piece of code that matches at least one Function Pattern Matching.

```typescript
function matchPattern(input: Input): Output {
  //some expression on input, with optional return
}
```

the pattern matches on

1. the input variable by type
2. equivalent access expression on the input variable
3. if the function returns, we require assignment or usage of the expression return.
   If the function does not returns, we require no return value assignment.
4. ignoring type annotations

For example, given the pattern

```typescript
function match(event: Event) {
  return event.target.value;
}
```

The matching searches for

- variable of type `Event` - which exists for event handlers
- access pattern `event.target.value`
- usage of the result of the expression, to be turned into a variable.

we can see that in example 2 above this pattern matches `(event.target as HTMLInputElement).value`
from the expression `setNewTodo((event.target as HTMLInputElement).value)`.

The pattern matches / not matches

```typescript
// match 1

let x = (event.target as HTMLInputElement).value;

// match 2
let y = event.target.value;

// match 3
let z1 = event.target;
let z2 = z1.value;

// no match 1 (not the full access path)
let n1 = event.target;

// no match 2 (does not return a value)
event.target.value;
```

# 2 - built in Safe Code Pattern

those include

- literal strings, numbers
- constant variables of strings, numbers
- standard Jay parameters
  - for event handlers - Event, viewState & coordinate

# 3 - Control Flow matching

Given a control flow of some sort, if all the components of the control flow are Safe Code Pattern.
We define a **safe control flow** as one that all of it's components are safe.

For instance, the following control flows are safe -

```typescript
// match 1
{
    safeExpression1;
    safeExpression2;
}

// match 2
if (safeExpression1);
    safeExpression2;

// match 3 - one or more switch branches, including default
switch (safeExpression1) {
   case safeExpression2:
      safeExpression3;
}

// match 4 - any flavor of for
for (safeExpression1)
   safeExpression2
```

The real world is that we will have, under a control flow, a mix of safe and unsafe expressions.
A Safe expression matches even if subset of it's expressions are safe, but then it only includes that subset.

# 4 - extraction

the matching **safe control flows** with their expressions are extracted from the source code, with the following algorithm

1. a new function is defined for the main thread that runs the same **safe control flows** and **safe expressions**,
   not including any unsafe expressions. Any safe expression that returns a value is assigned to a single return object
2. all the **safe expressions** that return a value are replaced with returned variables from the main thread function.
   all the **safe expressions** that do not return a value are eliminated from the original code.
3. Any **safe control flows** which are empty after the above step are also eliminated from the original code.

# Examples:

the pattern
![the pattern](25%20-%20building%20the%20compiler%20-%20code%20splitting%20pattern.png)

lets take a simple event handler
![x](25%20-%20building%20the%20compiler%20-%20code%20splitting%20ex%201%20-%201.png)

With function pattern matching
![x](25%20-%20building%20the%20compiler%20-%20code%20splitting%20ex%201%20-%202.png)

in this case we do not have built in Safe Code Pattern or Control Flow matching

With code extraction
![x](25%20-%20building%20the%20compiler%20-%20code%20splitting%20ex%201%20-%203.png)
