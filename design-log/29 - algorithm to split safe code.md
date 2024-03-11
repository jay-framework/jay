# Code Splitting Algorithm

The algorithm aims to enable the splitting of a function into two functions - a **safe** and **unsafe** function based
on configurable patterns.

Given a function

```typescript
({ event, viewState, coordinate }) => {
  if (event.keyCode === ENTER_KEY) {
    event.preventDefault();
    let newValue = newTodo();
    let val = newValue.trim();
    if (val) setTodos(/*... some updated todos */);
    setNewTodo('');
  }
};
```

and given

1. a pattern that allows `event.preventDefault`
2. given `ENTER_KEY` is a constant
3. `newTodo`, `setTodos` and `setNewTodo` are state functions considered unsafe code

split into

```typescript
// safe function, runs in the main thread / window
({ event, viewState, coordinate }) => {
  if (event.keyCode === ENTER_KEY) {
    event.preventDefault();
  }
  return { $0: event.keyCode };
};

// unsafe function, runs in sandbox
({ event, viewState, coordinate }) => {
  if ($0 === ENTER_KEY) {
    let newValue = newTodo();
    let val = newValue.trim();
    if (val) setTodos(/*... some updated todos */);
    setNewTodo('');
  }
};
```

This algorithm performs the above function split.

# The algorithm

We use the notation of

- `Statement` - a line of code, or multiple lines as part of a code block `{}`.
- `Expression` - a code fragment that returns a value.

The algorithm has the following steps

1. Compute `Variable` assignment chains (access `a.b`, assignment `a = b`, compositions `={a: b}` and decomposition `{a: b} = `) using `NameBindingResolver`
2. Compute `Statement`s dependencies based on the above `Variable`s.
3. Compute which `Statement`s are **safe** based on statement dependencies and checking if they are composed of all **safe** `Expression`s
4. Splitting the function based on **safe** and **unsafe** `Statements` and `Statement` dependencies.

Given the above example:

## 1. Compute `Variable`s

![variables](29%20-%20algorithm%20to%20split%20safe%20code%20-%201.png)

The variables in the code above (in green)

| Variable     | path             | root                |
| ------------ | ---------------- | ------------------- |
| `ENTER_KEY`  | `[]`             | `AST-constant`      |
| `event`      | `['event']`      | `AST-params[0]`     |
| `viewState`  | `['viewState']`  | `AST-params[0]`     |
| `coordinate` | `['coordinate']` | `AST-params[0]`     |
| `newValue`   | `[]`             | `AST-function-call` |
| `val`        | `[]`             | `AST-function-call` |

In blue are property access chains using those variables,
which are then used to compute the source value for each variable, dependencies and pattern matching

Note that variables do not analyze the actual AST - given a function call or a trinary operator,
the connection between the parts is kept modelled as the AST root. Such analysis is done below at the `isSafe` function.

### The NameBindingResolver

The `NameBindingResolver` is a utility to calculate the origins of `Identifier` into `Variables` given property access,
assignment, deconstruction, etc.

The basic element is the `Variable` which explains an `Identifier`.

```typescript
export interface Variable {
  name?: string; // optional variable name - an identifier
  accessedFrom?: Variable; // the variable it was accessed from using property access
  accessedByProperty?: string; // the property used for the access
  assignedFrom?: Variable; // another variable it was assigned from using a=b
  root?: VariableRoot; // the root node in the TS AST that is the root of the access chain
  properties?: Variable[]; // variables created using deconstruction
}
```

The `Varaible` abstraction captures a number of relationships of values access, assignment or decomposition.

- `a.b` is captured using `accessedFrom: a, accessedByProperty: 'b'`.
- `func(a: Type)` is captured using `root: AST-Parameter`.
- `let c = b` is captured using `assignedFrom: b`.
- `let {d} = c` is captured using `accessedByProperty: d, accessedFrom: c`.
- `let z = {y: a}` is captured using `assignedFrom: {properties: [{name: y, assignedFrom: a}]}`

### The `flattenVariable` function

The function takes a variable and returns a flattened access path, resolving access, assignment composition and decomposition.

The function result is

```typescript
export interface FlattenedAccessChain {
  path: string[];
  root: VariableRoot;
}
```

Two variables are the same if their `FlattenedAccessChain` is equal.

The `FlattenedAccessChain` is used to compare compiler patterns with expressions (`identifier`s and `PropertyAccessChain`s)
to determine if the accessed value is the same as the pattern, and those considered **safe**.

### SourceFileNameBindingResolver

We can create addition to the AST such that for each `Identifier` we can ask what is the corresponding `Variable` in a source file.

e.g.

```typescript
let variable: Variable = sourceFileNameBindingResolver.explain(astIdentifier);
```

Internally the `SourceFileNameBindingResolver` maintains a map of `ast nodes` to `NameBindingResolver`,
creating `NameBindingResolver` for each function, for, switch or block statements,
and then given an `Identifier` can lookup the closest parent `NameBindingResolver` and resolve the Identifier.

## 2. Compute `Statement` dependencies

![variables](29%20-%20algorithm%20to%20split%20safe%20code%20-%202.png)

- each nested statement is automatically dependent on it's parent statement (structural dependency)
- the `if` condition expression `event.keyCode === ENTER_KEY` depends on the variable `event` from the parent statement
- the `event.preventDefault()` depends on the two levels up statement due to the `event` variable
- the statement `let val = newValue.trim()` depends on the previous line due to the variable `newValue`;

### The SourceFileStatementDependencies

The `SourceFileStatementDependencies` models the dependencies between statements with the above login.

It provides the dependencies as

```typescript
export interface StatementDependencies {
  id: number; // internal id, can be used for testing
  parent?: Statement; // the parent statement
  statement: Statement; // the current statement
  dependsOn: Set<StatementDependencies>; // what it depends on
  isDependencyFor: Set<StatementDependencies>; // what depends on it
}
```

## 3. Compute `isSafe` for statements

The first part to compute `isSafe` is to understand it is relevant to coding patterns.
Given code patterns, we can determine if an expression is safe.

### coding patterns

We define 4 types of coding patterns -

1. `CompilePatternType.RETURN`:

   A pattern that returns a value. It can be replaced with a variable resolved in the main environment.

   ```typescript
   import { JayEvent } from 'jay-runtime';

   function inputValuePattern(jayEvent: JayEvent<any, any>) {
     return jayEvent.event.target.value;
   }
   ```

2. `CompilePatternType.CALL`

   A pattern that is a function call. With a match, the statement has to be fully moved
   to the main context.

   ```typescript
   import { JayEvent } from 'jay-runtime';

   function eventPreventDefault(jayEvent: JayEvent<any, any>) {
     jayEvent.event.preventDefault();
   }
   ```

3. `CompilePatternType.CHAINABLE_CALL`

   Similar to a call pattern, but also returns a value, which can be used for chaining

   ```typescript
   function stringReplace(value: string, regex: RegExp, replacement: string): string {
     return value.replace(regex, replacement);
   }
   ```

4. `CompilePatternType.ASSIGNMENT`

   Pattern identifying an assignment to a value in the main context.

   ```typescript
   import { JayEvent } from 'jay-runtime';

   function setInputValue(jayEvent: JayEvent<any, any>, value: string): string {
     jayEvent.event.target.value = value;
   }
   ```

From the patterns above we extract

1. the pattern type - return, call, call & return or assignment
2. the pattern statement access chain - the left side in the function above.
3. the pattern input types
   1. The first is the left hand side root type
   2. The second an on are function call parameters
4. the pattern output type
5. target environment - `main`, or `any`

types are supported with patterns by tracking the type name and import path.
We stringify a type designator such that we can easily compare types.

In the above, `JayEvent` which imported from `jay-runtime` is stringify
into `jay-runtime.JayEvent`. native types are represented as is - `string`, `number`, etc.

### Analyzing statements - `anayzeStatement(statement)`

When looking at a statement considering if it is safe, we need to consider the expressions
that build the statement, and we can get a few results

1. the statement expressions are all matching patterns, and can be moved to the main context - safe statement
2. the statement is using patterns that mandate the statement has to run in the main context
3. the statement is using an expression that does not match a pattern, and has to run in the sandbox
4. the statement is using an expression that matches a pattern, and this expression has to run in the main context,
   while the rest of the statement remains in the sandbox

Modeling all the statuses above, we have

- Statement that has to run in main
- Statement that has can run in both contexts
- Statement that has to run in Sandbox
- Statement that has to run in Sandbox, but has sub-expressions who can run in main

### Analysing expressions - `isSafeExpression(expression)`

We consider an expression as safe using `isSafeExpression` if is matching one or more patterns
organized as a chain. We also restrict expression to only include property access,
function calls and trinary expressions.

For each statement, we derive the target environment as one of
`JayTargetEnv.main`, `JayTargetEnv.any` or `JayTargetEnv.sandbox`.

1. pattern matching can only include

   - property access - `a.b.c`
   - property array access using constant - `a['b'].c`
   - type casting - `(a.b as B).c`
   - function calls - `a()`, in which case the function params are also checked using `isSafeExpression`
   - trinary expressions - `a?b:c`, in which case both branches are also checked using `isSafeExpression`

2. We **do not support** expressions including anything else (by design), including

   - inline function definitions - `(function () {}).a`
   - property array access using expression - `a[b].c`
   - async expressions - `(async a.b()).c`
   - callback expressions - `a.map(_ => f(_)).b`

3. we support chaining expressions based on expression return type.

   Given two expressions `a.b, returning string` and `b.c, b expected to be string`,
   we will match `a.b.c` to the chaining of the two expressions.

4. for each expression matching, we extract the target environment.
   we have two options - requires `JayTargetEnv.main`, or supports both main and sandbox `JayTargetEnv.any`.
   we, by design, assume that anything that does not match a pattern requires sandbox.

   in the case of pattern chaining, if one pattern is `JayTargetEnv.main` and another `JayTargetEnv.any`
   the whole expression is considered `JayTargetEnv.main`

5. If the statement is an assignment statement and the analysis so far marked it as `JayTargetEnv.any`,
   the statement is considered `JayTargetEnv.main`.

### the `AnalysisResult` for `Statement`s and `Expression`s

The `SourceFileStatementAnalyzer` performs the above analysis, and given
a `Statement` or `Expression` can give the analysis result.

```typescript
interface MatchedReadPattern {
  patterns: CompiledPattern[];
  expression: Expression;
  testId: number;
}

interface AnalysisResult {
  targetEnv: JayTargetEnv;
  matchedPatterns: MatchedReadPattern[];
}
```

- `targetEnv` - what is the target environment for this expression or statement
- `matchedPatterns` - the patterns matched for expressions of the statement.
  even if the statement target environment is `JayTargetEnv.sandbox`,
  the statement may have sub `RETURN` expressions which can be replaced with
  variables resolved in the `JayTargetEnv.main`.
  - `expression` - which expression that was matched.
  - `pattern` - the one or more patterns the expression matched.
    Potentially, we may have a chain of pattern matched.

Notes:

1. do we need support for chaining with read patterns? probably.
2. the statement analysis is based on nested expression analysis,
   not including nested statement analysis

### unsupported JS features

The following Statement types are not supported and code using them will be considered `JayTargetEnv.sandbox`:

- `with`
- `for`
- `for in`
- `for of`
- `while`
- class declaration
- function declaration
