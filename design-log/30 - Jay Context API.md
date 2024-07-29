# Jay Content API

Context API solves two concerns with other frameworks -

1. _Dependency Injection_ - inject an object to a sub-component without having all the parent components hand it over
   explicitly, what is also called `property drilling`.
2. _Update component on change_ - when the context value changes, all component who are using it are updated.

With Jay, we also add a 3rd requirement for the context API: 3. _Explicit Declaration_ - The consumption of the context has to be explicit in the consuming component.

## Low level API vs High Level API

The Runtime package exposes a low level context API based on

```typescript
interface ContextType {
  /*context members*/
}

const CONTEXT_SYMBOL = createContext<ComponentContext>();

provideContext(
  CONTEXT_SYMBOL,
  {
    /*context members*/
  },
  () => {
    // ... under some deep call stack
    let theContext = useContext(CONTEXT_SYMBOL);
  },
);
```

This low level API only solves the first requirement of _dependency injection_, but not the other two.

## High Level Context API

To meet the 3rd requirement, _Explicit Declaration_, we suggest to extend the Jay Component `Props<>` model such that
given a `Prop key` that is a `Symbol`, it is not turned into a getter. The component model will inject contexts to props
based on those Symbols.

Not turning context into a getter has two advantages - allowing deconstructing, and implying the context itself is not
updated.

To meet the 2nd requirement, we make the context reactive such that a component can follow Signals of the context.
This implies that we have a constructor callback to create the context reactive. Another option is to create a reactive,
and use it as the ContextItself.

### The proposed high level Context API:

```typescript
import {TodoComponent} from "./todo";

interface TodoContext {
   todos: Getter<Array<TodoItem>>;

   updateTodo(newItem: TodoItem);

   removeTodo(item: TodoItem);

   newTodo(newItem: TodoItem);
}

const TODO_CONTEXT = createContext<TodoContext>();

// provide context
const todoContext = reactive(() => {
   const [todos, setTodos] = createState(/* initial value*/);
   const updateTodo = (newItem: TodoItem) => {
      /*...*/
      setTodos(/*...*/);
   };
   const removeTodo = (item: TodoItem) => {
      /*...*/
      setTodos(/*...*/);
   };
   const newTodo = (newItem: TodoItem) => {
      /*...*/
      setTodos(/*...*/);
   };
   return {todos, updateTodo, removeTodo, newTodo};
});

// in the parent component
provideContext(TODO_CONTEXT, todoContext, () => {
   // jay creation of child components
});

// in some child decendent component
function TodoConstructor(
        {}: Props<TodoProps>,
        refs: TodoElementRefs,
        {todos, updateTodo, removeTodo, newTodo}: TodoContext
) {
   // do something with todos
   const activeTodoCount = createMemo(() =>
           todos().reduce(function (accum: number, todo: ShownTodo) {
              return todo.isCompleted ? accum : accum + 1;
           }, 0),
   );

   refs.newTodo.onkeydown(({event}: JayEvent<KeyboardEvent, TodoViewState>) => {
      if (event.keyCode === ENTER_KEY) {
         event.preventDefault();
         let newValue = newTodo();
         let val = newValue.trim();

         if (val) {
            newTodo({
               /*... todo members ... */
            });
         }
         setNewTodo('');
      }
   });
}

const Todo = makeJayComponent(TodoConstructor, TodoElement, TODO_CONTEXT);
```

# Analysis

From the example above, we see that we do not have to mix the Context API and the Reactive API - we can leave them as separate APIs
handling two separate concerns.

- Context API deals with dependency injection
- Reactive API deals with reactive updates

The combination of both allows solving the greater context problem.

However, there are still gaps to handle

1. Context injection into child components
2. Component Reactive to listen to changes in Context Reactive, and flush both reactives in Sync
3. Context providing from a parent component

## 1. Context Injection into Component Properties

### first try

We define that once a component property is a `Symbol`, `Jay Component` checks if the symbol is of a context.
If it is, it is injected into the component properties using `useContext(CONTEXT_SYMBOL)`.

However, we do have a challenge, as types are not prevent in runtime, how can we know that the component prop type
requires a Symbol?

One potential solution is to have the Jay Compiler extract the contexts used by the component from the Props type,
and include those as another member `CONTEXTS` symbol on the component constructor function, in essence adding
metadata to the component.

```typescript
// transform from
function Todo(
  { TODO_CONTEXT: { todos, updateTodo, removeTodo, newTodo } }: Props<TodoProps>,
  refs: TodoElementRefs,
) {}

// to
function Todo(
  { TODO_CONTEXT: { todos, updateTodo, removeTodo, newTodo } }: Props<TodoProps>,
  refs: TodoElementRefs,
) {}
Todo[CONTEXTS] = [TODO_CONTEXT];
```

Such compiler transformation is challenging in general, as it requires the `TypeChecker`. However, if we allow
to restrict the analysis such that the `Props` interface of the `Component` has to be in the same file, we can
use `AST` only analysis, which is fast and sufficient.

Another problem is how do we define which members of the properties interface are `Symbol`s? Typescript has the answer
for that in the `AST` itself, as usage of a `string` or `Symbol` keys in an interface are different

```typescript
interface MyProps {
  [symbolKey]: string;
  stringKey: string;
}
```

the above does not work, because Jay Context marker, while is a Symbol, is in terms of type system a generic object.
In type system, a generic object type cannot be a key for an interface type

### second try

We can try a different approach - instead of adding context as a prop, we can add it as a 3rd component constructor parameter.

```typescript
function Todo(
        { }: Props<TodoProps>,
        refs: TodoElementRefs,
        { todos, updateTodo, removeTodo, newTodo }: TodoContext
) {}
```

The above method works and meets the requirements such that
1. the component interface includes the context
2. the context is typed and supports deconstruction

However, how to we perform the actual injection?

We note that we are changing the component constructor function, adding a 3rd varargs context parameter
```typescript
export type ComponentConstructor<
        PropsT extends object,
        Refs extends object,
        ViewState extends object,
        Contexts extends Array<any>,
        CompCore extends JayComponentCore<PropsT, ViewState>> =
        (props: Props<PropsT>, refs: Refs, ...contexts: Contexts) => CompCore
```

For the actual injection we can use the same Generic `Contexts` type to ensure `mkJayComponent` also accepts 
the context markers such that it can inject contexts. 

```typescript
type ContextMarkers<T extends any[]> = {
   [K in keyof T]: ContextMarker<T[K]>;
};

declare function makeJayComponent<
        PropsT extends object,
        ViewState extends object,
        Refs extends object,
        JayElementT extends JayElement<ViewState, Refs>,
        Contexts extends Array<any>,
        CompCore extends JayComponentCore<PropsT, ViewState>,
>(
        render: RenderElement<ViewState, Refs, JayElementT>,
        comp: ComponentConstructor<PropsT, Refs, ViewState, Contexts, CompCore>,
        ...contexts: ContextMarkers<Contexts> 
): (props: PropsT) => ConcreteJayComponent<PropsT, ViewState, Refs, CompCore, JayElementT>
```

While this option works, it has two disadvantages
1. it requires defining the context twice - once as a parameter of the component constructor using the context type, 
   the second time in the makeJayComponent call.
2. it does not validate the marker type matching the context type

It has the advantages that
1. context is declared as part of the component inputs
2. it requires adding the markers on the makeJayComponent function call, as many as requested contexts



## 2. Component Reactive to listen to changes in Context Reactive

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

## Reactive pairing

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

### Cycling updates - option 1 (rejected, too complicated)

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
});
```

### Cycling updates - option 2

**Prevent circular dependencies by preventing updating states from reactions**. Contrary to the above solution,
With this option setting `setY()` will fail in createReaction regardless of which states are used.

```typescript
const [X, setX] = reactive.createState();
const [Y, setY] = reactive.createState();
reactive.createReaction(() => {
  setY(X() + 1); // will fail
  setX(X() + 1); // will fail
});
```

The advantages of this model -

- simpler to understand, no need to track why one setter is allowed in createReaction and why another is not.
- simpler to build, no need to track states of which state was updated before the flush and which was not
- In real live, there is almost no need to update state from a reaction

Yet, this model fails when we have two reactives and the following senario

```
Reactive A - setState X
Reactive A - reaction reading X (createEffect), updating Reactive B state Y
Reactive B - reaction reading Y
```

It fails because this is the only way to update context from a component using a tool like `createEffect`

### Cyclic updates - option 3

**Prevent a State to be updated twice with different values during one update-flush cycle**.
The logic is that any code who does update a state twice to different values is probably a mistake.

For instance, what is the expectation in the following case?

```typescript
let [X, setX] = createState();
createEffect(() => console.log(X()));

setX(7);
setX(8);
```

Because of batching, the value set to 7 will not be logged as the `console.log` running as an effect only runs once.
It solves any cycling problem while allowing updates to propagate `state -> reaction -> state -> reaction -> state...`
as long as we do not repeat a state.

We can expand the rule to also not run a reaction twice during one update-flush cycle.

### formal definition - preventing cycles (not needed, see below)

1. We define **update-flush** cycle of reactive is one instance of updates to `state`s and one instance of `flush` that runs reactions.
2. We restrict `state` updates to accept only one new value during one `update-flush` cycle.
   In the next cycle, the `state` can be updated again.
   The rule applies to each `state` individually (update to state A does not prevent updating state B)

### Synced flush

Lets explore an example of two reactive's

```typescript
const reactiveA = new Reactive();
const [a1, setA1] = reactiveA.createState(1);
const [a2, setA2] = reactiveA.createState('the count is 1');
reactiveA.createReaction(() => {
  // reaction i
  setA2(`the count is ${a1()}`);
});

const reactiveB = new Reactive();
const [b1, setB1] = reactiveB.createState([1, 2, 3]);
reactiveB.createReaction(() => {
  // reaction ii
  setA1(b1().length);
});
reactiveB.createReaction(() => {
  // reaction iii
  console.log(`${JSON.stringify(b1())} - ${a2()}`);
});

setB1([1, 2, 3, 4]);
```

Our expectation is the execution order, when updating `b1` will be
`b1 -> reaction ii -> a1 updated -> reaction i -> a2 updated -> reaction iii -> printing updated b1 and a2`.

However, given how reactive works now, we have a challenge if we change the order of reaction `ii` and `iii`.

```typescript
reactiveB.createReaction(() => {
  // reaction iii
  console.log(`${JSON.stringify(b1())} - ${a2()}`);
});
reactiveB.createReaction(() => {
  // reaction ii
  setA1(b1().length);
});
```

Now, `reactiveB` will run `iii` before `ii`
(from the point of view of `reactiveB` both depend on `b1` so can run in any order, as evident in our ability to replace
their code position). What will happen now is that unless `reactiveB` know someone to run `ii` before `iii`, the running
order will be `b1 -> reaction iii -> printing update b1 and not updated a2 -> reaction ii -> a1 updated -> reaction i -> a2 updated`.

**The above is a problem, as the developer working on the component `reactiveB` does not need to understand
the code involved with `reactiveA` and the order of reactions should not be important**. The root cause of the problem
is that reactive rely on the code ordering to create the DAG (directed acyclic graph) for running reactions,
a model that fails once we have two separate reactives.

#### Sync Flush ordering - DAG

We do note that if we look at both graphs (of both reactives), we can still maybe extract the right ordering.
The graphs are

```
reactiveA:
  A1 -> reaction i -> A2

reactive B:
  B1 -> reaction ii (-> A1)
        reaction iii (<- A2)
```

We note that the full dependency DAG, spanning both raectives, is actually correct. \*\*If we transform the `state` - `reaction`
into a DAG, at which `reaction`s are the nodes and `state` dependencies are the edges, we can perform a Topological Sort
(which is quite efficient at `O(V+E)` V-vertex count, E-edge count), then run the `reactions` in the order resulting
from the sort.

To list the DAG

- `Reaction`s are Vertexs
- `state setter` are edge starts
- `State getter` are edge ends

However, the Idea of using a DAG does not work because the algorithms to sort a DAG are based on knowing all the DAG in advance.
With Reactive, the dependencies are discovered at each cycle of **update-flush** as part of the running of the reactions,
when a reaction is reading a state.

So this approach fails.

#### The Big Decision

The option we explore is as we find more reactions to run of another reactive, we prioritize the other reactive
reactions.

With this example

```typescript
const reactiveA = new Reactive();
const [a1, setA1] = reactiveA.createState(1);
const [a2, setA2] = reactiveA.createState('the count is 1');
reactiveA.createReaction(() => {
  // reaction i
  setA2(`the count is ${a1()}`);
});

const reactiveB = new Reactive();
const [b1, setB1] = reactiveB.createState([1, 2, 3]);
reactiveB.createReaction(() => {
  // reaction ii
  setA1(b1().length);
});
reactiveB.createReaction(() => {
  // reaction iii
  console.log(`${JSON.stringify(b1())} - ${a2()}`);
});

setB1([1, 2, 3, 4]);
```

Right after running reaction `ii`, we identify that we have set a state for another reactive, `reactiveA`.
We now start running flush for `reactiveA` and run reaction `i`, before we continue to run the reactions of `reactiveB`. 
Reaction `i` sets the state `a2` of `reactiveA`.
Then, `reactiveB` continues and runs reaction `iii` which reads `a2` state. All fine.

If we change the order of reactions `ii` and `iii`,

```typescript
const reactiveB = new Reactive();
const [b1, setB1] = reactiveB.createState([1, 2, 3]);
reactiveB.createReaction(() => {
  // reaction iii
  console.log(`${JSON.stringify(b1())} - ${a2()}`);
});
reactiveB.createReaction(() => {
  // reaction ii
  setA1(b1().length);
});

setB1([1, 2, 3, 4]);
```

In this case, reaction `iii` runs first, reading the stale value of `a2`, as until reaction `ii` is running,
we (the system) does not know there an update path from `ii -> a1 -> i -> a2`.

The decision we need to make:

1. One option is that once we learn that `a2` was updated, that we need to rerun reaction `iii`.
2. Another option is to not rerun reaction `iii` and tell the user we do not back-rerun.
   Order the reactions in each reactive in an order that makes sense.

**We tend to go with the second option**

The rule we get from it, is that when a component updates a context, only the reactions after (in code order) the
update to the context will see the updated context.

## Reactive Pairing rules: 
1. when a reactive detects setting a state on another reactive, it triggers a flush on the other reactive 
   right after the reaction ends, and before running more reactions.
2. when a reactive is in flush state, it ignores calls for flush (as today, to prevent flush cycles)
3. no need to prevent updating state twice, as this algorithm ensures no cycles.

### Formally, the reactive pairing algorithm

Given Reactive `A` and Reactive `B`

Without Pairing, each is independent
`A` runs it's reactions in order `R[1]` to `R[N]`
`B` runs it's reactions in order `S[1]` to `S[M]`

With pairing caused by Reaction `R[X]` of `A` updating a state on `B` we get

When `A` runs, it will run `R[1]` to `R[X]` and detect, in `R[X]` that a state of `B` was updated.
At this point, `A` will trigger flush on `B` (If `B` is in a flush state nothing happens).
`B` will run reactions `S[1]` to `S[M]`.
Then, `A` will continue and run reactions `R[X+1]` to `R[N]`.

## 3. Context Providing

In react, a Context is provided as 
```typescript jsx
function App() {
   const [text, setText] = useState("");

   return (
           <div>
              <MyContext.Provider value={{ text, setText }}>
                 <MyComponent />
              </MyContext.Provider>
           </div>
   );
}

export default App;
```

In Jay Runtime, Context is provided as
```typescript
// in the parent component
provideContext(TODO_CONTEXT, todoContext, () => {
   // jay creation of child components
});
```

However, when we review the Jay component model, we see that the above does not fit.

A simple Jay Component who may provide context
```typescript
function SomeComponentConstructor({}: Props<SomeProps>, refs: SomeRefs) {
   return {
      render: () => ({})
   }
}
```

### provideContext hook 

The component is not wrapping the creation of child components as in React or Jay runtime context assumption.
The reality is that the component creation itself does wrap the child components creation, however this is handled 
internally by `makeJayComponent`.

So what is the best API for a component as the above to provide a context?

We can opt to use 
```typescript
function SomeComponentConstructor({}: Props<SomeProps>, refs: SomeRefs) {
   provideContext(TODO_CONTEXT, {/*... some context ...*/})    
   return {
      render: () => ({})
   }
}
```
This API looks great, but it causes us another problem - it has the same name as the jay runtime `provideContext` 
but a different structure.

A simple mitigation is to rename `provideContext` to `withContext` for the version with a callback,
and call the component API hook as `provideContext` (without a callback).

### component creation problem

We identify another problem in providing context - it is that an element `render` function runs before the component
constructor runs, in order to get the `refs` as an input to the component constructor. However, it also means that 
child components are created before the parent component, making it impossible for the parent component to provide 
context from it's creation to the child component at the time of the child component creation.

One option is to fix a long outstanding problem of cycling creation at which
component needs the element `refs`, while the `element` needs the component generated `view state`. 
The current solution is to 
1. we render the element with an empty `view state`
2. we use the `refs` from the element to create the component and generate `view state`
3. we update the element with the `view state`.

We suggest another option here. To split the `refs` and `element` creation into two steps, so that 
1. create the `refs`
2. create the component with `refs`, generating `view state`
3. render the element with the `view state`

This means a change in the generated element model (a big change). Lets explore that change for a sec

The good news is that we have all the infra in place for that. `PrivateRef<ViewState, BaseJayElement<ViewState>>`
in runtime already decouples the actual element reference from the `ref` itself, using the 
`set(referenced: ReferenceTarget<ViewState>): void;` member.

we can transform from today's
```typescript
export function render(viewState: TodoViewState, options?: RenderElementOptions): TodoElement {
    return ConstructContext.withRootContext(viewState, () => {
        const refItems = ccr('items');
        return e('div', {}, [
           e('button', {}, [], er('clearCompleted')),
           forEach(vs => vs.items, (vs1: Item) => {
              return childComp(Item, (vs: Item) => ({/* some props */}), refItems())}, 'id')
            /*... more child elements...*/
        ])
    })
}
```

to declaring all refs in advance and returning both the refs and the render function 
```typescript
export function makeRender() {
   const refManager = new ReferencesManager() 
   const refItems = refManager.ccr('items');
   const clearCompleted = refManager.er('clearCompleted');
   return [refManager.refs,
      function render(viewState: TodoViewState, options?: RenderElementOptions): TodoElement {
         return ConstructContext.withRootContext(viewState, () => {
            return e('div', {}, [
               e('button', {}, [], clearCompleted()),
               forEach(vs => vs.items, (vs1: Item) => {
                  return childComp(Item, (vs: Item) => ({/* some props */}), refItems())
               }, 'id')
               /*... more child elements...*/
            ])
         })
      }]
}
```
