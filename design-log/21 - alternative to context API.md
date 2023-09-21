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

## Alternative Context API

```typescript
class WithContext<T, C extends object> {
  constructor(public func: (context: C) => T) {}

  exec(context: C) {
    return this.func(context);
  }
}

class VElement {}
interface ContextA {
  aa: string;
}
function A<C extends ContextA>(
  a: string,
  b: number,
  children: Array<WithContext<VElement, C>>,
): WithContext<VElement, C> {
  return new WithContext((c) => {
    children.forEach((_) => _.exec(c));
    return new VElement();
  });
}

interface ContextB {
  bb: string;
}
function B<C extends ContextB>(
  a: string,
  b: number,
  children: Array<WithContext<VElement, C>>,
): WithContext<VElement, C> {
  return new WithContext((c) => {
    children.forEach((_) => _.exec(c));
    return new VElement();
  });
}
function C<C extends ContextA>(
  a: string,
  children: Array<WithContext<VElement, C & ContextB>>,
): WithContext<VElement, C> {
  return new WithContext((c) => {
    children.forEach((_) => {
      let context = { ...c, bb: 'a' };
      _.exec(context);
    });
    return new VElement();
  });
}

let x = A<ContextA & ContextB>('a', 7, [A('g', 6, [B('b', 6, [])]), B('c', 8, [])]);

let y = A('a', 7, [C('t', [B('d', 4, [])])]);
x.exec({ aa: 'aaa', bb: 'earag' });
y.exec({ aa: 'aaa' });
```
