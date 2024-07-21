# Jay Content API

Context API solves two concerns with other frameworks - 
1. *Dependency Injection* - inject an object to a sub-component without having all the parent components hand it over 
   explicitly, what is also called `property drilling`.
2. *Update component on change* - when the context value changes, all component who are using it are updated.

With Jay, we also add a 3rd requirement for the context API:
3. *Explicit Declaration* - The consumption of the context has to be explicit in the consuming component.

## Low level API vs High Level API

The Runtime package exposes a low level context API based on
```typescript
interface ContextType {/*context members*/}

const CONTEXT_SYMBOL = createContext<ComponentContext>();

provideContext(CONTEXT_SYMBOL, {/*context members*/}, () => {
  // ... under some deep call stack
  let theContext = useContext(CONTEXT_SYMBOL);
});
```

This low level API only solves the first requirement of *dependency injection*, but not the other two.

## High Level Context API

To meet the 3rd requirement, *Explicit Declaration*, we suggest to extend the Jay Component `Props<>` model such that
given a `Prop key` that is a `Symbol`, it is not turned into a getter. The component model will inject contexts to props 
based on those Symbols.

Not turning context into a getter has two advantages - allowing deconstructing, and implying the context itself is not
updated.

To meet the 2nd requirement, we make the context reactive such that a component can follow Signals of the context.
This implies that we have a constructor callback to create the context reactive. Another option is to create a reactive, 
and use it as the ContextItself.

### The proposed high level Context API:

```typescript
interface TodoContext {
    todos: Getter<Array<TodoItem>>,
    updateTodo(newItem: TodoItem)
    removeTodo(item: TodoItem)
    newTodo(newItem: TodoItem)
}

const TODO_CONTEXT = createContext<TodoContext>();

// provide context
const todoContext = reactive(() => {
    const [todos, setTodos] = createState(/* initial value*/);
    const updateTodo = (newItem: TodoItem) => {/*...*/setTodos(/*...*/)}
    const removeTodo = (item: TodoItem) => {/*...*/setTodos(/*...*/)}
    const newTodo = (newItem: TodoItem) => {/*...*/setTodos(/*...*/)}
    return {todos, updateTodo, removeTodo, newTodo}
})

// in the parent component
provideContext(TODO_CONTEXT, todoContext, () => {
    // jay creation of child components
})

// in some child decendent component
function Todo ({TODO_CONTEXT:{todos, updateTodo, removeTodo, newTodo}}: Props<TodoProps>, refs: TodoElementRefs) {
    // do something with todos
    const activeTodoCount = createMemo(() =>
        todos().reduce(function (accum: number, todo: ShownTodo) {
            return todo.isCompleted ? accum : accum + 1;
        }, 0),
    );

    refs.newTodo.onkeydown(({ event }: JayEvent<KeyboardEvent, TodoViewState>) => {
        if (event.keyCode === ENTER_KEY) {
            event.preventDefault();
            let newValue = newTodo();
            let val = newValue.trim();

            if (val) {
                newTodo({/*... todo members ... */})
            }
            setNewTodo('');
        }
    });

}
```

Analysis
===

From the example above, we see that we do not have to mix the Context API and the Reactive API - we can leave them as separate APIs 
handling two separate concerns.

* Context API deals with dependency injection
* Reactive API deals with reactive updates

The combination of both allows solving the greater context problem. 

However, there are still gaps to handle
1. Context injection into Properties
2. Component Reactive to listen to changes in Context Reactive, and flush both reactives in Sync

Context Injection into Component Properties
===== 

We define that once a component property is a `Symbol`, `Jay Component` checks if the symbol is of a context. 
If it is, it is injected into the component properties using `useContext(CONTEXT_SYMBOL)`.

However, we do have a challenge, as types are not prevent in runtime, how can we know that the component prop type 
requires a Symbol?

One potential solution is to have the Jay Compiler extract the contexts used by the component from the Props type, 
and include those as another member `CONTEXTS` symbol on the component constructor function, in essence adding 
metadata to the component.

```typescript
// transform from 
function Todo ({TODO_CONTEXT:{todos, updateTodo, removeTodo, newTodo}}: Props<TodoProps>, refs: TodoElementRefs) {}

// to 
function Todo ({TODO_CONTEXT:{todos, updateTodo, removeTodo, newTodo}}: Props<TodoProps>, refs: TodoElementRefs) {}
Todo[CONTEXTS] = [TODO_CONTEXT];
```

Such compiler transformation is challenging in general, as it requires the `TypeChecker`. However, if we allow 
to restrict the analysis such that the `Props` interface of the `Component` has to be in the same file, we can 
use `AST` only analysis, which is fast and sufficient.

Another problem is how do we define which members of the properties interface are `Symbol`s? Typescript has the answer 
for that in the `AST` itself, as usage of a `string` or `Symbol` keys in an interface are different

```typescript
interface MyProps {
   [symbolKey]: string,
   stringKey: string,
}
```

Component Reactive to listen to changes in Context Reactive
====

With Jay, both the Context Consuming Component, the Context Providing Component and the Context Itself all have 
different reactives, which require sync of flush and prevention of circular dependencies.

The interaction between context and component is such that
1. Context is always created before the components consuming it
2. Context can be created by the provider component, or before the provider component
3. Both the Context provider component and the Context Consumer component can listen to context state changes and react
   on those changes
4. Both the Context provider component and the Context Consumer component can call APIs on the context
5. Both the Context provider component and the Context Consumer component can listen to events on the context
6. The context cannot hold hard references to the consuming components, as it has no control over their lifetime.

Reactive pairing
======

As both the context and the components are reactive, we need to pair the reactive's flush. 

Example 1
```
Component A on listens on event, updates context state Z
Components B and C listen on context state Z and react with render (or memo and render)
```
If we do not pair the flush of component A and context, the context will flush async on next tick, 
and the components B and C will again flush on two other next ticks.

We want the updates and flush to be sync across all the components and context, triggered by the component A flush.

Example 2
```
Component A on listens on event, updates context state Z
Context state Z triggers updates to memo's T, R and S
Components B and C listen on context memo's T, R and S and react with render (or memo and render)
```
We want component B and C to be rendered once, even if they listen on multiple states or memos from the context.
If we do not pair the context and component B and C on flush, what will happen is that the context will update, 
then the components will update on next tick individually. 

We want the updates and flush to be sync across all the components and context, triggered by the component A flush.

Example 3
```
Component A listens on event, updates component state X
Component A memo/effect T listens on state X, and as part of the computation updates context state Z (directly or via context api call)
Context state Z triggers recomputation of context state Y
Component A memo/effect R listens on context state Y
Component A recomputation of R also updates state X 
```
The above has a cycling state update, which causes X to update as a result of a change in X, creating endless update loop.

Example 4
```
Component A listens on event, updates component state X
Component A memo/effect T listens on state X and as part of the computation updates state X - circular update.
```
The above also has a cycling state update, which causes X to update as a result of a change in X, creating endless update loop.

This problem is less critical for single component, as to write code that does example 3, one sees clearly the circular
dependency, and while hard to debug, can be understood.

The problem with component and context is that the cycle can span multiple components and contexts and becomes hard to comprehend.

### option 1 (rejected, too complicated)

To prevent circular dependencies, reactive have to be extended with a new validation rule -
**a state cannot be updated during flush if it was updated before the flush and is one of the triggers of the flush**.

The rule above mitigates the problem by not allowing the update of a state again during flush, if it was updated during reactive batch.

e.g.

```typescript
const [X, setX] = reactive.createState();
const [Y, setY] = reactive.createState();
reactive.createReaction(() => {
   setY(X() + 1); // ok, as the reaction does not depend on Y        
   setX(X() + 1); // will fail        
})
```

### option 2 (accepted)

Prevent circular dependencies by preventing updating states from reactions. Contrary to the above solution,
With this option setting `setY()` will fail in createReaction regardless of which states are used.

```typescript
const [X, setX] = reactive.createState();
const [Y, setY] = reactive.createState();
reactive.createReaction(() => {
   setY(X() + 1); // will fail        
   setX(X() + 1); // will fail        
})
```

The advantages of this model - 
* simpler to understand, no need to track why one setter is allowed in createReaction and why another is not.
* simpler to build, no need to track states of which state was updated before the flush and which was not
* In real live, there is almost no need to update state from a reaction

But we still have a challenge as `createMemo` is also using `createState` internally and updates the state
```typescript
export function createMemo<T>(computation: (prev: T) => T, initialValue?: T): Getter<T> {
   let [value, setValue] = currentComponentContext().reactive.createState(initialValue);
   currentComponentContext().reactive.createReaction(() => {
      setValue((oldValue) => computation(oldValue));
   });
   return value;
}
```

From this we derive we need a configuration option (maybe only as part of the low level `reactive` API, 
not the high level component API) to allow a state to be updated during a reaction.
