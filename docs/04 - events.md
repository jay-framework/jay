Working on Events in Jay Files
===

The challenge with events are that events are streaming information from the JayComponent back to the 
code using the JayComponent defined in a JayFile. 

For events, we have two key requirements
- expose a programming model that is efficient for the developer
- expose an event model (in the JayFile) that a designer can work with

Background
---

There are a lot of web frameworks, and a lot of ways web frameworks represent event binding to the HTML / template / JSX.
A good reference is [this blog post](https://webcomponents.dev/blog/all-the-ways-to-make-a-web-component/)

React / JSX event binding
```jsx
<button onClick={() => this.setState({ count: this.state.count - 1 })}>
```

Angular
```angular2html
<button (click)="dec()">-</button>
```

Stencil
```jsx
<button onClick={this.dec.bind(this)}>-</button>
```

Svelte
```html
<button on:click={dec}>
```
       
Native web component
```typescript
this.shadowRoot.getElementById('inc').onclick = () => this.inc();
```

SlimJS
```html
<button click="dec">-</button>
```

Lume Elements
```jsx
<button onclick=${() => (this.count -= 1)}>-</button>
```

We learn from those examples that developers prefer binding event to a function or to an inline function. 
However, those binding patterns have two challenges for Jay.
1. JayFiles should be logic free, not allowing inline event handlers
1. Designers writing JayFiles, or generating JayFiles, may not be able to bind the right event name to the 
   right code function


Events binding in Jay
===

With Jay, we try to decouple the JayFile from the code element. We explore two main directions for event bindings below.
More options can be found in the [exploration](../exploration) folder

1 - id based event binding
---
   
with this option we add an `id` property to the JayFile, which we are using for both 
event binding and for test driver generation

the JayFile
```html
<html>
<head>
    <script type="application/yaml-jay">
data:
   count: number
    </script>
</head>
<body>
    <div>
        <button id="dec">-</button>
        <span id="count">{count}</span>
        <button id="inc">+</button>
    </div>
</body>
</html>
```

The Code file extending it - one option
```typescript
import {JayElement} from "jay-runtime";
import {render, ViewState} from './counter.jay';

export function Counter(initial: number): JayElement<ViewState> {
    let count = initial;
    let element = render({count});

    function inc() {
        count += 1;
        element.update({count});
    }

    function dec() {
        count -= 1;
        element.update({count});
    }

    element.addEventListener('dec', 'click', _ => dec())
    element.addEventListener('inc', 'click', _ => inc())

    let update = (viewState: ViewState) => {
        count = viewState.count;
        element.update({count})
    }

    return {
        dom: element.dom,
        update: update
    }
}
```

and another option
```typescript
import {JayElement, events} from "jay-runtime";
import {render, ViewState} from './counter.jay';

export function Counter(initial: number): JayElement<ViewState> {
    let count = initial;

    function inc() {
        count += 1;
        element.update({count});
    }

    function dec() {
        count -= 1;
        element.update({count});
    }

    let element = render({count}, {
        dec: events().onclick(() => dec()),
        inc: events().onclick(() => inc())
    });

    let update = (viewState: ViewState) => {
        count = viewState.count;
        element.update({count})
    }

    return {
        dom: element.dom,
        update: update
    }
}
```

and yet another option
```typescript
import {JayElement} from "jay-runtime";
import {render, ViewState, eventsFor} from './counter.jay';

export function Counter(initial: number): JayElement<ViewState> {
    let count = initial;

    function inc() {
        count += 1;
        element.update({count});
    }

    function dec() {
        count -= 1;
        element.update({count});
    }

    let element = render({count}, [
        eventsFor('dec').on('click', () => dec()),
        eventsFor('inc').on('click', () => inc())
        ]
    );

    let update = (viewState: ViewState) => {
        count = viewState.count;
        element.update({count})
    }

    return {
        dom: element.dom,
        update: update
    }
}
```

2 - declaration based event binding
---

We can actually define the events in the JayFile, creating semantic events, 
like the following

```html
<html>
<head>
    <script type="application/yaml-jay">
data:
   count: number

events:
   dec: (count: Number)
   inc: (count: Number)
    </script>
</head>
<body>
    <div>
        <button onclick="dec(count)">-</button>
        <span>{count}</span>
        <button onclick="inc(count)">+</button>
    </div>
</body>
</html>
```

and the usage is then
```typescript
import {JayElement} from "jay-runtime";
import {render, ViewState} from './counter.jay';

export function Counter(initial: number): JayElement<ViewState> {
    let count = initial;
    let element = render({count});

    function inc() {
        count += 1;
        element.update({count});
    }

    function dec() {
        count -= 1;
        element.update({count});
    }

    element.onDec(_ => dec())
    element.onInc(_ => inc())

    let update = (viewState: ViewState) => {
        count = viewState.count;
        element.update({count})
    }

    return {
        dom: element.dom,
        update: update
    }
}
```
