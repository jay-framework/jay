Safe Events - an idea
===

When running application login in a worker that interacts with the DOM, we normally stumble on challenges 
caused by having an async API between the worker and the main thread. Things like opening a new window on 
event do not work, or preventing an event default, or starting a video 
playing.

The following code will not work from a worker - `event.preventDefault()` is a synchronous API
and if the below code is working from a worker cannot take effect.

```typescript
import {JayElement} from "jay-runtime";
import {makeJayComponent, Props, createState} from "jay-component"
import {render, ViewState, CounterElement} from './counter.jay';

export interface CounterProps {
    initial: number
}

export function Counter({initial}: Props<CounterProps>, element: CounterElement): JayElement<ViewState>{
    let [count, setCount] = createState(initial());

    element.subtracter.onclick(event => {
        event.preventDefault();
        setCount(count()-1)
    })
    element.adder.onclick(event => {
        event.preventDefault();
        setCount(count()+1)
    })

    return {
        render: ({
            count
        })
    }
}

export default makeJayComponent(render, Counter);
```  
            
Regular approach
---

The regular approach is to add actions or declaration for the features that are not supported from an async 
or worker context. For instance, in the above case, we can imagine a declaration that adds `preventDefault`
to the onClick event, by adding a new declaration `onclick_preventDefault()`

```typescript
import {JayElement} from "jay-runtime";
import {makeJayComponent, Props, createState} from "jay-component"
import {render, ViewState, CounterElement} from './counter.jay';

export interface CounterProps {
    initial: number
}

export function Counter({initial}: Props<CounterProps>, element: CounterElement): JayElement<ViewState>{
    let [count, setCount] = createState(initial());

    element.subtracter.onclick(_ => setCount(count()-1))
    element.subtracter.onclick_preventDefault();
    element.adder.onclick(_ => setCount(count()+1))
    element.adder.onclick_preventDefault();

    return {
        render: ({
            count
        })
    }
}

export default makeJayComponent(render, Counter);
```

This pattern works, but it also gets some pushback because of the inability of adding logic as to when to do
`preventDefault()` or play a video or open a new screen - it is just to restrictive.

Safe Event handlers
---


Let's focus again on the problem at hand - it is writing an event handler that should run with two conflicting 
requirements
1. it has to run on the main thread because it is using either a sync API or a safe API.
2. It has to run on the worker thread because of security - which is actually a derived requirement from 
   the requirement to not allow unsafe code from running in the main thread.
                                                                                  
Lets imaging a solution that meets both requirements

### 1. Compile unsafe code to safe code

It is well known that full javascript code cannot be made secure by static code analysis - meaning, 
using static code analysis one cannot prevent the programmer from hacking the system and doing whatever 
they want.

However, if we limit the Javascript code in a significant way, can we do static analysis that can verify
code is safe?

If we limit Javascript code, can it still solve the event needs?

What we try to do here is defining the **subset of Javascript for event handlers** while retaining the 
**full javascript for the component itself**.

```typescript
element.subtracter.onclick(
        (event) => event.preventDefault(), // runs on the main thread 
        _ => setCount(count()-1))  // runs in the worker
```

We can define this model as such that the main thread event handler can return a value to the worker handler
```typescript
declare function onclick<E extends Event, VS, T>(mainHandler: (e: E, viewState: VS) => T, workerHandler: (T) => void)
```

Where
* `mainHandler` runs on the main thread, and is limited to only access the event itself, the element viewState
  and a subset of Javascript. This function cannot access the component state, props or any other component 
  element that is not present in the element view state.
* `workerHandler` runs on the worker, is not limited in terms of javascript, can access component state, props,
  functions or any other assets in the worker.
