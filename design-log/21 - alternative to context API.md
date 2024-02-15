# Alternative to Context API

The React context API is a great tool to prevent property drilling. Lets first understand
the problem and the React Context solution, and why React Context is still a tradeoff.
We then suggest a better alternative, with the tradeoff that it has to be built into framework.

## What is property drilling?

Property Drilling is the pattern of passing data via multiple nested components or function
calls (remember that JSX is actually function calls to `React.createElement`).
In Short, property drilling can be expressed as functions or react elements, and looks like

manifestation for functions

```typescript
function f(firstName, lastName) {
  //....
  g(firstName, lastName);
}
function g(firstName, lastName) {
  //....
  h(firstName, lastName);
}
function h(firstName, lastName) {
  //....
  i(firstName, lastName);
}
function i(firstName, lastName) {}
```

manifestation for React components

```typescript jsx
function f(firstName, lastName) {
    return (<><g firstName={firstName} lastName={lastName}/></>)
}
function g(firstName, lastName) {
    return (<><h firstName={firstName} lastName={lastName}/></>)
}
function h(firstName, lastName) {
    return (<><i firstName={firstName} lastName={lastName}/></>)
}
function i(firstName, lastName) {
    return (<span>{firstName} {lastName}</span>)
}
```

In both cases, it is clear that the functions `g` and `h`, or components `g` and `h` do not need
to know about the properties `firstname` and `lastName`, they are only passing those around
from `f` to `i`.

## The React Context solution

The react context solution enables to pass the properties `firstName` and `lastName` almost magically
from `f` to `i`. Lets see it in action first

```typescript jsx
let context = React.createContext(null);
function f(firstName, lastName) {
    return (<context.Provider value = {{firstName, lastName}}>
        <g/>
    </context.Provider>)
}
function g() {
    return (<><h/></>)
}
function h() {
    return (<><i/></>)
}
function i() {
    const { fName, lName } = useContext(context);
    return (<span>{firstName} {lastName}</span>)
}
```

as we can see, the context API has solved one problem - we do not need to pass the `firstName`
and `lastName` properties via `g` and `h` - both of those components do not depends on those properties.

Before talking about the downside of the context API, lets consider how to do the same for pure functions -

```typescript
function f(firstName, lastName) {
  //....
  provideContext({ firstName, lastName }, () => {
    g();
  });
}
function g() {
  //....
  h();
}
function h() {
  //....
  i();
}
function i() {
  let { firstName, lastName } = _context;
}
```

a very simplistic implementation of `provideContext` can be (not really production grade)

```typescript
let _context;
function provideContext(context: any, func: () => void) {
  try {
    _context = context;
    func();
  } finally {
    _context = undefined;
  }
}
```

## What are the problems with a Context API?

The main problem with the Context API is that it has modelled the dependency of component
or function `i` as a hidden dependency - the dependency is not clear from the signature of
the function or component.

If we want to reuse the `i` function or component, we need to provide the context, and the
only three ways to find out about the dependency are 1. to read the code of `i`,
which can be long and complex. 2. to read the docs of `i` and 3. to run `i` and start debugging for errors.

As we can see, all three are far from ideal.

What if we can create a different context API, one such that prevents property drilling while
explicitly defines the dependencies of 'i'?

# Alternative Context API - prop cascading

The idea of property cascading is that given a component, the component inputs should only be using properties.

**When using the component, it is not required to provide all the properties. 
Any unprovided properties of the component become properties of the parent component automatically, by the compiler**

```typescript jsx
function f(firstName, lastName) {
    return (<provideProps component={i} props = {{firstName, lastName}}>
        <g/>
    </provideProps>)
}
function g(/** implicit firstName, lastName **/) {
    return (<><h/></>)
}
function h(/** implicit firstName, lastName **/) {
    return (<><i/></>)
}
function i({firstName, lastName}) {
    return (<span>{firstName} {lastName}</span>)
}
```

With the example above, 
* `i` requires `firstName` and `lastName` properties
* `h` and `g` implicitly gain the `firstName` and `lastName` properties because of their children.
  To use `h` or `g` directly, one is required to provide the `firstName` and `lastName` properties, 
  or gain the same implicit properties
* `f` provides the properties

The end result of this proposal is that `g` and `h` are unaware of the implicit properties, and do not change if a 
3rd property is added to `i`. `i` itself just defines properties, there is a single API for component inputs.

