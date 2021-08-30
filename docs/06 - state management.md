Working on state management
====

First, lets define the problem we are trying to solve with state management. 
Let's consider a simple component to demonstrate the problem - a counter
component with the options of initial value and step. 

Our component also shows a specific message when the count is zero. The component Jay element is then
```html
<html>
<head>
    <script type="application/yaml-jay">
data:
  count: number
  isZero: boolean
    </script>
</head>
<body>
<div>
    <button ref="subtracter">-</button>
    <span style="margin: 0 16px">{count}</span>
    <span if="{isZero}">absolute zero</span>
    <button ref="adder">+</button>
</div>
</body>
</html>
```

A simple counter component is then

```typescript
import {render} from './counter.jay.html';

function Counter(initialValue: number, step: number) {
    let data = {
        count: initialValue,
        isZero: initialValue === 0
    };
    let jayElement = render(data);

    jayElement.adder.onclick = () => {
        data.count += step;
        data.isZero = data.count === 0;
        jayElement.update(data);
    }

    jayElement.subtracter.onclick = () => {
        data.count -= step;
        data.isZero = data.count === 0;
        jayElement.update(data);
    }

    return {
        element: jayElement,
        update: (newValue: number, newStep: number) => {
            step = newStep;
            data.count = newValue;
            data.isZero = data.count === 0;
            jayElement.update(data);
        }
    }
}
```

We note that there are a number of patterns with this component
1. We have to call `jayElement.update({count})` on each event handler and the component update. 
   This is both a code duplicate and boilerplate
2. We have a computation of `isZero` in three places. This is again code duplication.
3. We have different type of data entities
  * `initialValue` and `step` are properties
  * `count` is a state
  * `isZeo` is a computed step
  * both `count` and `isZero` are the view state of the element

Can we create something better?

Data Flow
---

The data flow can take three main routes

1. `Properties -> State -> Computed State -> view state`
1. `Event -> state -> Computed State -> view state`
1. `API call -> state -> Computed State -> view state` 

First attempt - component builder call
---

It is clear that we have a uniform data path of `state -> Computed State -> view state`. We can use 
this property to create a `setState` API to trigger the data flow, and a `computeState` function for 
the computed state. With this in mind, we can create a state manager with a signature of 
`new StateManager<T, S, A extends JayElement<T>>(initialState: S, computeViewState: S => T, render: T => A)`

making the component look like

```typescript
import {render} from './counter.jay.html';
import {StateManager} from 'jay-state';

function Counter(initialValue: number, step: number) {
    let sm = new StateManager( 
        {count: initialValue},
        state => ({
            ...state,
            isZero: state.count === 0
        }), render);

    sm.jayElement.adder.onclick = () => {
        sm.setState(state => ({count: state.count + step}))
    }

    sm.jayElement.subtracter.onclick = () => {
        sm,setState(state => ({count: state.count - step}))
    }

    return {
        element: sm.jayElement,
        update: (newValue: number, newStep: number) => {
            step = newStep;
            sm.setState({count: newValue})
        }
    }
}
```

or 

`new StateManager<T, S>(initialState: S, computeViewState: S => T)`

```typescript
import {render} from './counter.jay.html';
import {StateManager} from 'jay-state';

function Counter(initialValue: number, step: number) {
    let sm = new StateManager(render,  
        {count: initialValue},
        state => ({
            ...state,
            isZero: state.count === 0
        }));

    let jayElement = sm.initializeElement(render);

    jayElement.adder.onclick = () => {
        sm.setState(state => ({count: state.count + step}))
    }

    jayElement.subtracter.onclick = () => {
        sm,setState(state => ({count: state.count - step}))
    }

    return {
        element: jayElement,
        update: (newValue: number, newStep: number) => {
            step = newStep;
            sm.setState({count: newValue})
        }
    }
}
```
       
Discussion
===

Before going into building a state management solution, we review two interesting approaches - 
the [React.js](https://reactjs.org/) and [Solid.js](https://solidjs.com) state management directions, and try to adjust both to Jay. 

React Recap
===

Lets have another look at how React and specifically React Hooks are used for state management. 

With React Hookss, our counter component looks like

```typescript jsx
import React, { useState, useEffect } from 'react';

function Counter(initialValue: number, step: number) {
    const [count, setCount] = useState(initialValue);

    useEffect(() => {
        setCount(initialValue);
    }, [initialValue])
  
    return (
        <div>
            <button onClick={() => setCount(count - step)}>-</button>
            <span style="margin: 0 16px">{count}</span>
            {count === 0? (<span >absolute zero</span>):''}
            <button onClick={() => setCount(count + step)}>+</button>
        </div>
    );
}
```
           
With the React state management, the code looks more concise, less boilerplate. To recap
* useState accepts the state initial value from the property initialValue 
* the state itself is managed in a magic place, indexed by the position to the `useState` call within the function
  in our case, the state index `0` references the `count` number, and the `setCount` function updates it
* on reach render, the `count` variable gets the current state number from index `0`. 
  The `initialValue` is not used anymore
* on button click, we call `setState` with the new state value. 
* in order to listen to `initialValue` changes, we can set `useEffect` that is called when the previous `initialValue`
  differs from the current one, and calls `setCount` to update the state with the change in `initialValue`.
* when updating the step property, there is no need to use `useEffect` as we do not update any invisible state. 
  In fact, we do update a state - one that is managed by the closures of the event handler functions.
  
Trying to recreate the React state management model
===

```typescript
import {render} from './counter.jay.html';
import {StateManager, useEffect, useState} from 'jay-hooks';

function Counter(initialValue: number, step: number) {
    return StateManager(render, () => {
        const [count, setCount] = useState(initialValue);

        useEffect(() => {
            setCount(initialValue);
        }, [initialValue])
       
        return {
            count, 
            isZero: count === 0 
        }
    }); 
}
```

We define `StateManager` with the type signature
```typescript
declare function StateManager<T, S extends JayElement<T>, R extends (T) => S>(
    render: R, 
    mkViewState: () => T)
``` 
where `T` is 
the view state type, `S` is the element and `R` is the render function.

This pattern works for state management, but how do we add the event handlers?

We have a number of options for adding the event handlers - 

## 1. we can add another construction step 
but then we do not have a reference to the `count` variable...

```typescript
import {render} from './counter.jay.html';
import {StateManager, useEffect, useState} from 'jay-hooks';

function Counter(initialValue: number, step: number) {
    return StateManager(render, () => {
        const [count, setCount] = useState(initialValue);

        useEffect(() => {
            setCount(initialValue);
        }, [initialValue])

        return {
            count,
            isZero: count === 0
        }
    }).events(je => {
        je.adder.onclick = () => setCount(count + step); // does not compile, count and setCount are out of scope
        je.subtracter.onclick = () => setCount(count - step); // does not compile, count and setCount are out of scope
    }); 
}
```

## 2. We can add the event handlers inside the StateManager function, like this 

```typescript
import {render} from './counter.jay.html';
import {StateManager, useEffect, useState} from 'jay-hooks';

function Counter(initialValue: number, step: number) {
    return StateManager(render, je => {
        const [count, setCount] = useState(initialValue);

        useEffect(() => {
            setCount(initialValue);
        }, [initialValue])

        je.adder.onclick = () => setCount(count + step);
        je.subtracter.onclick = () => setCount(count - step);
       
        return {
            count, 
            isZero: count === 0 
        }
    }); 
}
```

This option still feels a bit off, and has the problem that we recreate the closures for the event handlers 
on each render. We can do better

## 3. register events in a hook

```typescript
import {render} from './counter.jay.html';
import {StateManager, useEffect, useState, useEvents} from 'jay-hooks';

function Counter(initialValue: number, step: number) {
    return StateManager(render, () => {
        const [count, setCount] = useState(initialValue);

        useEffect(() => {
            setCount(initialValue);
        }, [initialValue])
        
        useEvents((je: CounterElement) => { 
            je.adder.onclick = () => setCount(count + step);
            je.subtracter.onclick = () => setCount(count - step);
        }, [count, step])
       
        return {
            count, 
            isZero: count === 0 
        }
    }); 
}
```

here we defined the dependency of the event handlers on a prop and a state member using the `useEvents` hook.
We can follow the React hooks convention that if the array is empty, we execute the events register on each render.
                  
## 4.  hiding the state manager 

we can make it even more idiomatic by hiding the state manager 
      
```typescript
import {ViewState, CounterElement} from './counter.jay.html';
import {useEffect, useState, useEvents} from 'jay-hooks';

function counter(initialValue: number, step: number): ViewState {
    const [count, setCount] = useState(initialValue);

    useEffect(() => {
        setCount(initialValue);
    }, [initialValue])
        
    useEvents((je: CounterElement) => { 
        je.adder.onclick = () => setCount(count + step);
        je.subtracter.onclick = () => setCount(count - step);
    }, [count, step])
       
    return {
        count, 
        isZero: count === 0 
    }
}
```

Jay can understand this is a component because it returns the `ViewState` which is the type parameter 
of the `JayElement` (let remind `jayElement` is defined as `JayElement<T>` which has an update func `updateFunc<T> = (newData:T) => void`).

However, there are still a few issues
* If we have two different elements that have the same `ViewState`, how do we decide which one fits this component?
* How do we statically derive the type of `je` in `useEvents`?

## 5. adding a component builder / register

```typescript
import {render, ViewState, CounterElement} from './counter.jay.html';
import {useEffect, useState, useEvents} from 'jay-hooks';
import {registerJayComponent} from 'jay';

interface CoutnerProps {
    initialValue: number, 
    step: number
}

function counter({initialValue, step}: CoutnerProps): ViewState {
    const [count, setCount] = useState(initialValue);

    useEffect(() => {
        setCount(initialValue);
    }, [initialValue])
        
    useEvents((je: CounterElement) => { 
        je.adder.onclick = () => setCount(count + step);
        je.subtracter.onclick = () => setCount(count - step);
    }, [count, step])
       
    return {
        count, 
        isZero: count === 0 
    }
}

registerComponent(render, counter);
```

We assume here that `registerJayComponent` has the signature
```typescript
declare function registerJayComponent<T, S extends JayElement<T>, P>(
    render: (viewState: T) => S, 
    component: (props: P) => T): void
```
                     
This pattern works, in the sense that it is declarative - we can deduce the component type
using code static analysis. However, it binds us to a specific form of creating components, 
and a specific form of state management. 

Lets decouple the component and state management

## 6. Define component and a component builder

We define a JayComponent as
```typescript
interface JayComponent<P, T, S extends JayElement<T>> {
    elementType: typeof S,
    update(props: P): T,
    mount(),
    unmount()
}
```

We define the hooks component builder as
```typescript
declare function mkJayComponent<T, S extends JayElement<T>, P>(
    render: (viewState: T) => S,
    component: (props: P) => T
): (props: P) => JayComponent<P, T, S> 
```

and we get for the full component file 
```typescript
import {render, ViewState, CounterElement} from './counter.jay.html';
import {useEffect, useState, useEvents, makeJayComponent} from 'jay-hooks';

interface CoutnerProps {
    initialValue: number, 
    step: number
}

function counter({initialValue, step}: CoutnerProps): ViewState {
    const [count, setCount] = useState(initialValue);

    useEffect(() => {
        setCount(initialValue);
    }, [initialValue])
        
    useEvents((je: CounterElement) => { 
        je.adder.onclick = () => setCount(count + step);
        je.subtracter.onclick = () => setCount(count - step);
    }, [count, step])
       
    return {
        count, 
        isZero: count === 0 
    }
}

export default makeJayComponent(render, counter);
```
                            
What have we gotten here?
1. we export a component factory function which take props and returns a JayComponent
```typescript
type componentFactory<P, T, S extends JayElement<T>> = 
    (P) => JayComponent<P, T, S> 
```
2. the `componentFactory` type is fully declarative and encodes, in the type system, the 
types of the props `P`, the view state type `T` and the jayElement type `S`. 
   
3. The function type does not assume anything about the function implementation, 
allowing using other ways to construct a JayComponent as long as the component
conforms to the same interface.   

                   
Solid.js Recap
===

Solid js is marketed as "A declarative, efficient and flexible JavaScript library for building user interfaces".
It takes a different approach from React in a number of subtle way.  

```typescript jsx
import { createSignal, createEffect, Show } from "solid-js";
import { render } from "solid-js/web";

interface CoutnerProps {
    initialValue: number,
    step: number
}

const Counter = (props: CoutnerProps) => {
    const [count, setCount] = createSignal(props.initialValue);

    createEffect(() => {
        setCount(props.initialValue)
    });

    return (
        <>
            <button onClick={() => setCount(count() + props.step)}>+</button>
            <span>{count()}</span>
            <Show when={count() === 0}>
                <span >absolute zero</span>
            </Show>
            <button onClick={() => setCount(count() - props.step)}>-</button>
        </>
    );
};
```

While solidjs component looks very similar to React component, there are a few key differences worth looking into.
* solid js component is a factory and runs only once, compared to a functional React component that runs on each render.

* `createSignal` and `useState` are very similar, except that `createSignal` returns a getter fucntion while react 
  returns a value. The fact that react re-runs the component on each render allows react to use values.

* solid js derives dependencies for things automatically - like in `createEffect`, something that is enabled 
  by the use of proxies and the fact that the component runs only once.
  
* because solid js runs once, we cannot do conditionals in JSX. Instead, flow control is managed using dedicated tags 
  like `Show`, `For`, `Switch`, etc.
  

Solid JS state management
---

Solid JS provides a number of hooks for state management, including

### 1. Create Signal
Basic reactive primitive, to handle a single value. 
 
```typescript
declare function createSignal<T>(
        value: T,
        options?: { name?: string; equals?: false | ((prev: T, next: T) => boolean) }
): [get: () => T, set: (v: T) => T];
```
Note: Unlike react useState, it does not return the value, rather it returns a value getter

### 2. Create Effect
Creates a new computation that automatically tracks dependencies and runs after each render where a dependency has changed.
```typescript
declare function createEffect<T>(
        fn: (v: T) => T,
        value?: T,
        options?: { name?: string }
): void;
```
Note: the effect function is called with the last value returned from the previous call to createEffect. 
The second parameter value cba ne used to initialize this previous call value.

### 3. Create Store 
```typescript
declare function createStore<T extends StoreNode>(
        state: T | Store<T>,
        options?: { name?: string }
): [get: Store<T>, set: SetStoreFunction<T>];
```
This creates a tree of Signals as proxy that allows individual values in nested data structures to 
be independently tracked. The create function returns a readonly proxy object, and a setter function.

Store supports nested objects, by wrapping those as proxies as well (not including build in objects like Date or HTML element)

Stores can use functions for calculated values```
```typescript
const [state, setState] = createStore({
  user: {
    firstName: "John",
    lastName: "Smith",
    get fullName() {
      return `${this.firstName} ${this.lastName}`;
    },
  },
});
```

Changing values can be by setting a value, a function, or undefined to remove a value
```typescript
const [state, setState] = createStore({
  firstName: "John",
  lastName: "Miller",
});

setState({ firstName: "Johnny", middleName: "Lee" });
// ({ firstName: 'Johnny', middleName: 'Lee', lastName: 'Miller' })

setState((state) => ({ preferredName: state.firstName, lastName: "Milner" }));
// ({ firstName: 'Johnny', preferredName: 'Johnny', middleName: 'Lee', lastName: 'Milner' })
```

It also has path based `setState`, with all kind of options, such as
```typescript
setState('counter', c => c + 1);
setState('list', l => [...l, {id: 43, title: 'Marsupials'}]);
setState('list', 2, 'read', true);
setState('todos', [0, 2], 'completed', true);
setState('todos', { from: 0, to: 1 }, 'completed', c => !c);
setState('todos', todo => todo.completed, 'task', t => t + '!')
setState('todos', {}, todo => ({ marked: true, completed: !todo.completed }))
```

Trying to build the Solid JS model
===
               
As moving to the solid.js model, we have a number of changes from the React model
* The function is now only called once, used as a constructor for state management
* we have to use the props as an object, and not decompose it - in order to enable the 
  auto detection of dependencies

## 1. with hook for view state

```typescript
import {render} from './counter.jay.html';
import {createEffect, createState, createEvents, createViewState, makeJayComponent} from 'jay-hooks';

interface CoutnerProps {
    initialValue: number, 
    step: number
}

function counter(props: CoutnerProps): void {
    const [count, setCount] = createState(initialValue);

    createEffect(() => {
        setCount(props.initialValue);
    })
        
    createEvents((je: CounterElement) => { 
        je.adder.onclick = () => setCount(count() + props.step);
        je.subtracter.onclick = () => setCount((val) => val - props.step);
    })
       
    createViewState(() => ({count: count(), isZero: count() === 0}))
}

export default makeJayComponent(render, counter);
```
             
Some notes: 
* With this option, we assume (like in solid js) that the props are a proxy, and those dependencies 
  are tracked automatically.
  
* The `counter` function runs only once, like Solid.js and unlike React.js. 
                                      
* This pattern is not strongly typed, as there is no way for `createViewState` to derive the specific 
  component `ViewState` type.
        
## 2. View State derived automatically

```typescript
import {render} from './counter.jay.html';
import {createEffect, createState, createEvents, createViewState, makeJayComponent} from 'jay-hooks';

interface CoutnerProps {
    initialValue: number, 
    step: number
}

function counter(props: CoutnerProps): void {
    const [count, setCount] = createState('count', initialValue);
    const [isZero] = createComputedState('isZero', () => count() === 0)

    createEffect(() => {
        setCount(props.initialValue);
    })
        
    createEvents((je: CounterElement) => { 
        je.adder.onclick = () => setCount(count() + props.step);
        je.subtracter.onclick = () => setCount((val) => val - props.step);
    })
}

export default makeJayComponent(render, counter);
```

With this option we added a property name to the `createState` function and add `createComputedState` function.
We map the state to the `ViewState` by name

Notes: 
* This option matches state to view state by name, and those is not type checked.


## 3. with returning view state function

```typescript
import {render, ViewState} from './counter.jay.html';
import {createEffect, createState, createEvents, makeJayComponent} from 'jay-hooks';

interface CoutnerProps {
    initialValue: number, 
    step: number
}

function counter(props: CoutnerProps): () => ViewState {
    const [count, setCount] = createState(initialValue);

    createEffect(() => {
        setCount(props.initialValue);
    })
        
    createEvents((je: CounterElement) => { 
        je.adder.onclick = () => setCount(count() + props.step);
        je.subtracter.onclick = () => setCount((val) => val - props.step);
    })
       
    return () => ({count: count(), isZero: count() === 0})
}

export default makeJayComponent(render, counter);
```

Some notes:
* this pattern is strongly typed, as `makeJayComponent` requires `render` and `counter` to have matching types
* the `() => ViewState` function dependencies are tracked automatically
* this solution still has the problem that we need a callback for `createEvents`, and that the type 
  of the `CounterElement` is not connected to the type of the `render` function. 
  
4. With passing in the element

```typescript
import {render, ViewState} from './counter.jay.html';
import {createEffect, createState, createEvents, makeJayComponent} from 'jay-hooks';

interface CoutnerProps {
    initialValue: number, 
    step: number
}

function counter(props: CoutnerProps, je: CounterElement): () => ViewState {
    const [count, setCount] = createState(initialValue);

    createEffect(() => {
        setCount(props.initialValue);
    })
        
    je.adder.onclick = () => setCount(count() + props.step);
    je.subtracter.onclick = () => setCount((val) => val - props.step);
       
    return () => ({count: count(), isZero: count() === 0})
}

export default makeJayComponent(render, counter);
```

Here we overcome the last shortcoming of the previous option - the fact that the type of `CounterElement`
was not directly connected to the `render` function type. Here, we can define `makeJayComponent` as

```typescript
declare function makeJayComponent<P, T, S extends JayElement<T>> (
        render: (T) => S,
        comp: (P, S) => () => T)
```

We can even decide to specialize the element type `S` even more removing the `JayElement` members using `omit`
```typescript
type ElementEvents<E> = Omit<E, "dom" | "update" | "mount" | "unmount">
declare function makeJayComponent<P, T, S extends JayElement<T>, E extends ElementEvents<S>> (
        render: (T) => S,
        comp: (P, E) => () => T)
```

The trick we are doing here with the events is not possible in the React case because of the nature
of the react function - which is called each time for each render, and will result in re-creation of event
handlers and risk of dangling closures. 

With the Solid pattern, the function is only called once, and the events will only be registered once.

