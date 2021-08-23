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
        count: initialValue
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
            <button onClick={increment}>+</button>
            <span>{count()}</span>
            <Show when={count() === 0}>
                <span >absolute zero</span>
            </Show>
            <button onClick={decrement}>-</button>
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

Trying to build the Solid JS model
===
