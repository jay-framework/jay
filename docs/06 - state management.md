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
            {count === 0? (<span if="{isZero}">absolute zero</span>):''}
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
`StateManager<T, S extends JayElement<T>, R: T => S>(render: R, mkViewState: () => T)`, where `T` is 
the view state type, `S` is the element and `R` is the render function.

This pattern works for state management, but how do we add the event handlers?

We have a number of options for adding the event handlers - 

1. we can add another construction step, 
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

2. We can add the event handlers inside the StateManager function, like this 

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

3. register events in a hook

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
                  
4.  hiding the state manager 

we can make it even more idiomatic by hiding the state manager 
      
```typescript
import {ViewState, CounterElement} from './counter.jay.html';
import {useEffect, useState, useEvents} from 'jay-hooks';

function Counter(initialValue: number, step: number): ViewState {
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





