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

### Compile unsafe code to safe code

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
declare function onclick<E extends Event, VS, T>(secureHandler: (e: E, viewState: VS) => T, workerHandler: (T) => void)
```

Where
* `secureHandler` runs on the main thread, and is limited to only access the event itself, the element viewState 
  and referenced dom nodes, a subset of Javascript. This function cannot access the component state, props or any other component 
  element that is not present in the element view state.
* `workerHandler` runs on the worker, is not limited in terms of javascript, can access component state, props,
  functions or any other assets in the worker.

### Limitations of the secureHandler code

The code of the `secureHandler` is extracted and validated by the compiler, and runs in the main thread.
                                                                                                        
It is restricted by
* cannot access the component state, props or any inner variable as the code actually runs on another thread
* cannot access the generic dom - can only access DOM elements that are referenced in the element
* cannot define classes 
* cannot use new Function constructor (`new Function(...)`) to prevent breaking the sandbox
* cannot create regular functions, only arrow functions
* can access only a whitelist of the browser APIs (`Location` allowed, `document` not allowed)
* cannot perform network requests

Maybe restricted
* We are not sure about the loop keywords `for` and `while` - we have a feeling that those are not required 
  and can be replaced with `array.forEach` and similar array operands
* Should we allow the `new` keyword? it is not clear that we need it

It enables doing the following
* simple logic, including `if`, `array.forEach`, etc.
* access the view state
* access the jay element referenced dom elements
* access the native event
* call allowed browser APIs
* can create arrow functions

## examples

### prevent event default

```typescript
element.ref.onclick(
        (event) => event.preventDefault(), // runs on the main thread 
        _ => setCount(count()-1))  // runs in the worker
```

### navigate with opening a new tab / window

```typescript
element.ref.onclick(
        (event, vs) => window.open(vs.url, '_blank'), // runs on the main thread 
        _ => {}) // runs in the worker
          
```

### start a video

```typescript
element.vidRef.onclick(
        (event, vs) => element.vidRef.play(), // runs on the main thread 
        _ => {}) // runs in the worker 
```

Safe Event handlers - Creating an API
---

For safe event handlers, the API for using them should enable and follow a number of guidelines - 

1. it should run sync with the actual DOM event to enable privileged APIS
2. It should be able to access the view state of the element, and perform simple conditional on them
3. It should enable a seamless API for DOM values, like input value or checkbox checked APIs

With those in mind, we suggest to consider safe events as a *macro* that appears in the developer code 
as a higher level function, yet interpret it's argument as code to be parted as safe and run in main thread.

Consider the following event handler

```typescript
refs.title.onchange = (event, todo) => {
    todo.editText = (event.target as HTMLInputElement).value
}
```

Introducing safe events, and allowing only main thread to access element values, we get
                    
### option 1
```typescript
refs.title.onchange = async (todo) => {
    todo.editText = await privileged((event) => (event.target as HTMLInputElement).value)
}
```

with this option the position of the privileged call is not important inside the event handler, it will 
always fun first. This syntax is nice as it provides the data context as a closure variable which is shimmed 
within main thread. 

### option 2
```typescript
refs.title.onchange = privileged((event, todo) => (event.target as HTMLInputElement).value)
    .then((value, todo) => todo.editText = value);
}
```

With this option we are more explicit as to what happens at the cost of reverting to more old school promise 
syntax.

### option 3
```typescript
refs.title.onchange = privileged((event, todo) => (event.target as HTMLInputElement).value)
    .andReturn((value, todo) => todo.editText = value);
}
```

This option is more explicit to the fact we do not have a regular promise here, but a special case
macro that translates to a promise.

# Prior work

[ADSafe](https://www.adsafe.org/)

https://developer.salesforce.com/docs/atlas.en-us.lightning.meta/lightning/security_code.htm

## Shopify RemoteUI
                
## Neriol
Project [Nerio](https://github.com/kmacrow/Nerio)
                              
## Realms and SAS                           

Looking at figma and the work they have done using Realms, the approach looks very interesting

* https://www.figma.com/blog/how-we-built-the-figma-plugin-system/
* https://agoric.com/blog/technology/realms-shim-security-updates/
* https://github.com/endojs/endo/tree/master/packages%2Fses
* https://github.com/Agoric/realms-shim/blob/v1.1.0/src/evaluators.js#L60-L69

The big advantage - a single JS engine, with guards to prevent 3rd party code from accessing and tempering 
with other apps code. 
                                                                      
However, when digging into it, it seems that the guard surface is way too large - consider this file 
https://github.com/endojs/endo/blob/master/packages/ses/src/commons.js - which lists all the methods of `array`, 
`map`, `set`, etc and for each implement a guard - **an approach that is not future prof 
(once a JS engine adds a new function that is not listed in the file)** and exposes too large options for 
mistakes.

**I do not believe this approach will converge on a solid platform - the attack surface is too large**.

Still, we can add this approach (the base of which is the 8 magic lines) to our proposal above of safe events, 
on top of the compiler that ensures we only use a safe subset of JS.
                                                           
Code taken from https://github.com/endojs/endo/blob/master/packages/ses/src/make-evaluate-factory.js
```typescript
export const FERAL_FUNCTION = Function;
export const makeEvaluateFactory = (constants = []) => {
    const optimizer = buildOptimizer(constants);
    return FERAL_FUNCTION(`
    with (this) {
      ${optimizer}
      return function() {
        'use strict';
        return eval(arguments[0]);
      };
    }
  `);
}
```