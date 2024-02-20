# Code Splitting Algorithm

The algorithm aims to enable the splitting of a function into two functions - a **safe** and **unsafe** function based 
on configurable patterns.

Given a function
```typescript
({event, viewState, coordinate}) => {
    if (event.keyCode === ENTER_KEY) { 
       event.preventDefault()
       let newValue = newTodo();
       let val = newValue.trim();
       if (val)
          setTodos(/*... some updated todos */)
       setNewTodo('');
    }
}
```

and given 
1. a pattern that allows `event.preventDefault`
2. given `ENTER_KEY` is a constant
3. `newTodo`, `setTodos` and `setNewTodo` are state functions considered unsafe code

split into 
```typescript
// safe function, runs in the main thread / window 
({event, viewState, coordinate}) => {
   if (event.keyCode === ENTER_KEY) {
      event.preventDefault()
   }
   return {$0: event.keyCode}
}

// unsafe function, runs in sandbox
({event, viewState, coordinate}) => {
   if ($0 === ENTER_KEY) {
      let newValue = newTodo();
      let val = newValue.trim();
      if (val)
         setTodos(/*... some updated todos */)
      setNewTodo('');
   }
}
```

This algorithm performs the above function split.

# The algorithm

We use the notation of 
* `Statement` - a line of code, or multiple lines as part of a code block `{}`.
* `Expression` - a code fragment that returns a value.

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
|--------------|------------------|---------------------|
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
   name?: string;                  // optional variable name - an identifier
   accessedFrom?: Variable;        // the variable it was accessed from using property access
   accessedByProperty?: string;    // the property used for the access
   assignedFrom?: Variable;        // another variable it was assigned from using a=b
   root?: VariableRoot;            // the root node in the TS AST that is the root of the access chain
   properties?: Variable[];        // variables created using deconstruction
}
```

The `Varaible` abstraction captures a number of relationships of values access, assignment or decomposition.

* `a.b` is captured using `accessedFrom: a, accessedByProperty: 'b'`.
* `func(a: Type)` is captured using `root: AST-Parameter`.
* `let c = b` is captured using `assignedFrom: b`.
* `let {d} = c` is captured using `accessedByProperty: d, accessedFrom: c`.
* `let z = {y: a}` is captured using `assignedFrom: {properties: [{name: y, assignedFrom: a}]}`

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
* each nested statement is automatically dependent on it's parent statement (structural dependency)
* the `if` condition expression `event.keyCode === ENTER_KEY` depends on the variable `event` from the parent statement
* the `event.preventDefault()` depends on the two levels up statement due to the `event` variable
* the statement `let val = newValue.trim()` depends on the previous line due to the variable `newValue`;

### The SourceFileStatementDependencies

The `SourceFileStatementDependencies` models the dependencies between statements with the above login.

It provides the dependencies as 

```typescript
export interface StatementDependencies {
   id: number,                                  // internal id, can be used for testing
   parent?: Statement;                          // the parent statement
   statement: Statement;                        // the current statement
   dependsOn: Set<StatementDependencies>,       // what it depends on
   isDependencyFor: Set<StatementDependencies>, // what depends on it
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
   import {JayEvent} from 'jay-runtime';
   
   function inputValuePattern(jayEvent: JayEvent<any, any>) {
       return jayEvent.event.target.value;
   }
   ```

2. `CompilePatternType.CALL`
   
   A pattern that is a function call. With a match, the statement has to be fully moved 
   to the main context.

   ```typescript
   import {JayEvent} from 'jay-runtime';
   
   function eventPreventDefault(jayEvent: JayEvent<any, any>) {
       jayEvent.event.preventDefault();
   }
   ```

3. `CompilePatternType.CHAINABLE_CALL`

   Similar to a call pattern, but also returns a value, which can be used for chaining

   ```typescript
   function stringReplace(value: string, regex: RegExp, replacement: string): string {
       return value.replace(regex, replacement)
   }
   ```

4. `CompilePatternType.ASSIGNMENT`

   Pattern identifying an assignment to a value in the main context.

   ```typescript
   import {JayEvent} from 'jay-runtime';
   
   function setInputValue(jayEvent: JayEvent<any, any>, value: string): string {
       jayEvent.event.target.value = value;
   }
   ```
   
From the patterns above we extract 
1. the pattern type - return, call, call & return or assignment
2. the pattern statement access chain - the left side in the function above.
3. the pattern input types
4. the pattern output type

types are supported with patterns by tracking the type name and import path. 
We stringify a type designator such that we can easily compare types.

In the above, `JayEvent` which imported from `jay-runtime` is stringify 
into `jay-runtime.JayEvent`. native types are represented as is - `string`, `number`, etc.


### pattern matching







# Stage 2 - isSafeStatement
We define a **safe** `Statement` as a statement that all of it's expressions are safe. 

A safe expression is one that only access variables and functions that are matching a **safe pattern**.

Safe patterns are explained in [25 - building the compiler](25%20-%20building%20the%20compiler.md).

We assume here a utility function `isSafeStatement` that given an `Expression`, patterns and `NameBindingResolver` can 
determine if the expression is considered safe.

We note here a few types of **safe** - 
* **Safe** - Statement which has only **safe** expressions.
* **safe dependencies** - Statement which is **safe** and all of the statements it depends on are also **safe**.
* **compound safe** - statement which is by itself safe dependencies, yet have child statements (like `if`, `for`, `switch`) which may be safe or not.

The function `isSafeStatement` only determines that a statement is **Safe**. 

# Stage 3 - The Statements DAG

The DAG is used to capture statement dependencies, which are used to calculate which statements are safe and 
can be moved to run in the main context instead of the sandbox context.

Given the ability to check if a statement is *safe* `isSafeStatement` based on Jay compiler patterns, the DAG calculates
1. what are the statements our statement depends on
2. are all of those statements *safe* as well?
3. are any of those statements are dependent by other *unsafe* statements?
4. what statements to move to the main context, such that
   1. A statement is copied to the main context if it and all of it's dependencies are *safe*.  
   2. A statement is deleted from the sandbox context if it is *safe* and there are no dependant *unsafe* statements that depend on it. 

There are two types of statement dependencies - *temporal* or *identifier* based.

*Temporal* dependencies are such that assume statement `A` is executed before statement `B` - normally when they create 
dependent side effects. Examples are `console.log`, dependent database operations, dependent IO operations, etc. 
We note that in most cases, statements that depend temporally are either *safe* or *unsafe*. 

*Identifier* dependencies are such that statement `A` defines an identifier which is used by statement `B`. 

**the DAG algorithm is using *Identifier* dependencies.**  

### unsupported JS features 

The DAG will not support `while` statement as it is deprecated and will consider any usage of `while` as *unsafe* code.

### DAG creation

The DAG is created for `Block` statements, such that given an event handler (`FunctionDeclaration`, `FunctionExpression` 
or `ArrowFunction`) it is created for the `body` element (except for the case of expression `ArrowFunction` in which case 
the DAG is not needed).

mapping of Statement Types and their child statements

```typescript
SourceFile
  statements: Statement[]
ExpressionStatement
Block --> Statement
  statements: Statement[] 
FunctionDeclaration
  body: Block
ArrowFunction
  body: Block | Expression
FunctionExpression
  body: Block 
ifStatement
  expression: Expression
  thenStatement: Statement
  elseStatement?: Statement
IterationStatement
  statement: Statement
ForStatement --> IterationStatement
ForInStatement --> IterationStatement
ForOfStatement --> IterationStatement
DoStatement --> IterationStatement
WhileStatement --> IterationStatement
ImportDeclaration
```

Note that `Block extends Statement` which means we can have a block at any location we have a statement

This means that a source file is a graph of statements

