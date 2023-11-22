# Server Site Rendering

## Requirements

1. render the elements to `stream` or `string`
2. Support async rendering in the server
3. No state management on server
4. Expose web methods to the client
5. Enable client only components or server only components
6. Enable lazy loading of client code - on event or on idle

## Build Components

If we consider the `Jay Element` as a build time function of the structure `() => Definition<ViewState -> UI>` we can
define build time components that are functions of `(Definition<ViewState -> UI>) => Definition<ViewState -> UI>` that
enable to set values into UI at build time, letting server and client components to continue working from that
point forward.

## observation

In Jay, the **Element** is a function `ViewState -> UI`

- **Build Element** - is the Jay file definition which is formally `() => Definition<ViewState -> UI>`.

- **Client Element** - On the **client** it translates to
  `ViewState -> {dom: Element, update: (ViewState) -> void}`, the update function to enable updating the DOM.

- **Server Element** - On the **server** it should translate to
  `ViewState -> {htmlFragment: string | stream}`.

The **Component** is a function `Props -> ViewState`

- **Client Component** - On the **client** it translates to
  `Props -> {update: () -> ViewState}`, the update function used to update the UI.

- **Server Component** - On the **server** it translates to
  `Props -> Promise<ViewState>`
- **Build Component** - at build time, a higher level function over the element definition
  `(Definition<ViewState -> UI>) => Definition<ViewState -> UI>`

We can have **Pure Client** components at which the component renders initially (on the server or client) using
a null View State, then updates once the client component kicks in.

We can have **Pure Server** components at which the client component is the Unit Function
`(server rendered View State) -> View State`.

We can have **Lazy loaded** components at which the **Server Component** renders the component, and the
**Client Component** is only loaded on first interaction.

## Example

Let's consider the Counter Component - the component is now split into 3 files

- Counter Element
- Counter Client Component
- Counter Server Component

### Counter Element

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
      <button ref="subtracter">-</button>
      <span style="margin: 0 16px">{count}</span>
      <button ref="adder">+</button>
    </div>
  </body>
</html>
```

### Counter Client Component

> Note: no need to get the server rendered view state - by definition, the server and client components will get
> the same props. The server component can, in addition, return a server state to the client.

```typescript
import { renderCounterElement } from './counter.jay.html';
import { createEvent, createState, makeJayComponent, Props } from 'jay-component';

interface CounterProps {
  initialValue: number;
  step: number;
}

interface CounterServerState {}

function CounterComponent(
  { initialValue, step }: Props<CounterProps>,
  refs: CounterRefs,
  serverState: CounterServerState,
) {
  let [value, setValue] = createState(initialValue);
  refs.inc.onclick = () => setValue(value() + step());
  refs.dec.onclick = () => setValue(value() - step());
  let onChange = createEvent<number>((emitter) => emitter.emit(value()));
  return {
    render: () => ({ value }),
    onChange,
  };
}

let counterComponent = makeJayComponent(renderCounterElement, CounterComponent);
```

### Counter Server Component

> Note: not final API for server component

```typescript
import { CounterProps, CounterServerState } from './counter.client';
import { Props } from 'jay-component';

export async function CounterComponent({ initialValue, step }: Props<CounterProps>) {
  let value = (await loadInitialValueFromSomeDatabase()) || initialValue();
  return {
    render: () => ({ value }),
    serverState: {},
  };
}
```
