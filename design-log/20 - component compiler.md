Component Compiler
=================

Once we open the door for a component compiler in Jay, we should consider what other 
component compilations we want to introduce.

Secure Events transformation
---

The first transformation comes from security point of view, transforming
```typescript
// component file
refs.input.$oninput(({event}) => (event.target as HTMLInputElement).value)
    .then(({event}) => setText(event))
```

into 
```typescript
// component file
refs.input.$oninput($handler<Event, CompViewState, any>('1'))
    .then(({event}) => setText(event))

// native-funcs.ts
export const funcRepository: FunctionsRepository = {
    "1": ({event: Event}) => (event.target as HTMLInputElement).value
}
```

Jay Element transformation
----

The second potential transformation is the extraction of JSX from the component file 
to create the Jay Element. 

The potential is to extract the Jay Element DOM structure from the JSX and auto generate 
the data script. 

It does create a challenge of handling JSX fragments and code lists of fragments, which can be modelled
as internal JayElements.

Consider the component with JSX
```typescript jsx
export interface CounterProps {
    title: string
    initialCount: number
}
function CounterConstructor({title, initialCount}: Props<CounterProps>, refs: CounterElementRefs) {

    let [count, setCount] = createState(initialCount)

    refs.subtracter.onclick(() => setCount(count() - 1));
    refs.adder.onclick(() => setCount(count() + 1));

    return {
        render: () => (<div>
            <div>{title}</div>
            <div>
                <button onclick={() => setCount(count() - 1)}>-</button>
                <span style="margin: 0 16px">{count}</span>
                <button onclick={() => setCount(count() + 1)}>+</button>
            </div>
        </div>),
    }
}
```

which can be compiled into
```typescript jsx
// componnet file
export interface CounterProps {
    title: string
    initialCount: number
}
function CounterConstructor({title, initialCount}: Props<CounterProps>, refs: CounterElementRefs) {

    let [count, setCount] = createState(initialCount)

    refs.r1.onclick(() => setCount(count() - 1));
    refs.r2.onclick(() => setCount(count() + 1));

    return {
        render: () => ({title, count}),
    }
}

// element file
<html>
    <head>
        <script type="application/yaml-jay">
    data:
title: string | number
count: string | number
</script>
</head>
<body>
<div>
    <div>{title}</div>
    <div>
        <button ref="r1">-</button>
        <span style="margin: 0 16px">{count}</span>
        <button ref="r2">+</button>
    </div>
</div>
</body>
</html>
```

Astro Style syntax
------

Another option is to use Astro style API instead of React / JSX like API, which turns into

```html typescript
---
export interface CounterProps {
    title: string
    initialCount: number
}
function CounterConstructor({title, initialCount}: Props<CounterProps>, refs: CounterElementRefs) {

    let [count, setCount] = createState(initialCount)

    refs.r1.onclick(() => setCount(count() - 1));
    refs.r2.onclick(() => setCount(count() + 1));
    
    return {
      render: () => ({title, count})
    }
}
---
<div>
    <div>{title}</div>
    <div>
        <button ref="sub">-</button>
        <span style="margin: 0 16px">{count}</span>
        <button ref="add">+</button>
    </div>
</div>
```

Client - Server splitting / transformation
----

Another potential is to split the component code for server and client bundles, 
addressing the needs to 
1. start rendering the component on the server using server only code, 
   potentially creating initial state
2. continue running the component on the client, continuing using state
3. creating calls from the client to the server

An example of how such a component syntax can look like
```typescript
export interface CounterProps {
    title: string
    initialCount: number
    dbConnection$: DBConnection 
}
function CounterConstructor({title, initialCount, dbConnection$}: Props<CounterProps>, refs: CounterElementRefs) {

    let [count, setCount] = createState(initialCount)

    initTask$(async () => {
        let dbCount = await dbConnection$.query('select count from counters where title = ?', [title()]);
        if (dbCount)
            setCount(dbCount);
    })
    
    createEffect(() => {
        serverTask$(async () => {
            dbConnection$.exec(`update counters set count = ? where title = ?`, [count(), title()])
        })
    })
    
    refs.subtracter.onclick(() => setCount(count() - 1));
    refs.adder.onclick(() => setCount(count() + 1));

    return {
        render: () => ({title, count}),
    }
}
```

In the above example we have added 3 proposed constructs
* `prop$` - a property that only exists on the server component
* `initTask$` - a server function that is called to initialize the component
  * if using SSR - as part of the component SSR
  * if using CSR - as an AJAX / REST call from the component to the server
* `serverTask$` - a server function that can be called from the client

We also note that the above does not handle sockets (server initiated updates) and has 
an anomaly that `createEffect` runs on component creation and will introduce an unnecessary
DB update, and should only trigger on actual value change. Maybe it requires a different hook?

Still, with the above, the component will be compiled into two different components, such that
```typescript
// server component
export interface CounterProps {
    title: string
    initialCount: number
    dbConnection$: DBConnection
}
function CounterConstructor({title, initialCount, dbConnection$}: Props<CounterProps>, refs: CounterElementRefs) {

    let [count, setCount] = createState(initialCount)
    
    let init = exposeAPI(1, async () => {
        let dbCount = await dbConnection$.query('select count from counters where title = ?', [title()]);
        if (dbCount)
            setCount(dbCount);
        hydrateState([count])
    })

    let api2 = exposeAPI(2, async (count, title) => {
        dbConnection$.exec(`update counters set count = ? where title = ?`, [count, title])
    })

    return {
        render: () => ({title, count}),
        init,
        api2
    }
}

// client component
export interface CounterProps {
    title: string
    initialCount: number
}
function CounterConstructor({title, initialCount, dbConnection$}: Props<CounterProps>, refs: CounterElementRefs) {

    let [count, setCount] = createState(initialCount)
    
    dehydrateState(1, [setCount]);

    createEffect(() => {
        callServerTask(2, count(), title())
    })

    refs.subtracter.onclick(() => setCount(count() - 1));
    refs.adder.onclick(() => setCount(count() + 1));

    return {
        render: () => ({title, count}),
    }
}
```
