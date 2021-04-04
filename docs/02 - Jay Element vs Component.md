Jay Element vs Jay Component
===

![Overview](01%205%20Jay%20Element%20vs%20Jay%20Component.png "Overview")
                                                                         
The Jay system consists of two main entities - the **Jay Component** and the **Jay Element**.

Jay Element
-

The **Jay Element** is a pure declarative design, including data and states that is represented as an HTML + CSS files.
The **Jay File** consists of, in addition to HTML and CSS, an addition of special Jay tags and a data script
that represent the inputs of the JayElement. 

An example Jay Element looks like (non final syntax) 

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

It is compiled into a file with the `.d.ts` of

```typescript
import {JayElement} from "jay-runtime";

interface ViewState {
  count: number,
}

export declare function render(viewState: ViewState): JayElement<ViewState>
```

Jay Component
---

The **Jay Component** adds logic to the **Jay Element** by composing over it, and looks like
(non final syntax - we are still not sure about events syntax and if it will extend `JayElement` or maybe `JayComponent`)

```typescript
import {JayElement} from "jay-runtime";
import {render, ViewState} from './counter.jay';

export function Counter(initial: number): JayElement<ViewState>{
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

    // non final event binding syntax
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

