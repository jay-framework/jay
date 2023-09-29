# Guiding principles of Jay

## 1. no magic 
Jay tries to be as `Typescript` compatible as possible.

A few examples -

1. for the `.jay.html` files we generate `.d.ts` files that represent what those files are compiled into
2. Jay components are defined using the `makeJayComponent` function
3. the Jay state management library is explicit, not relaying on compiler magic

## 2. Make decisions as early as possible, no dead code

Any decision that can be done by the compiler has to be done by the compiler, not at runtime.
We strive to have a runtime condition free - without `if`, `?` or `switch` statements.
The only valid `if` is to check `if (oldValue !== newValue)`.

We consider a site rendering as having 4 stages
1. compiler - at which we compile and build the application based on the application code
2. SSG - at which we compile and optimize the application based on additional inputs. 
3. SSR - at which we render the application on a server
4. CSR - at which we make the application interactive on the client

Each stage can make decisions that render some of the code "dead" for the next phase. Such dead code has to be eliminated 
and not shipped to the next phase. 

## 3. Reactive

All updates are fine grained reactive, based on states (signals) and computer values.

## 4. immutable data
Jay is built with the assumption that data is immutable.

(denote version of a value with a subscript like a<sub>1</sub> or a<sub>2</sub>)

* If a<sub>1</sub> !== a<sub>2</sub> we assume 'a' has changed, and will trigger DOM update.
* if a<sub>1</sub> === a<sub>2</sub> we assume 'a' has not changed, and will not trigger DOM update.

same goes for deep objects

* If a.b.c<sub>1</sub> !== a.b.c<sub>2</sub> we assume 'c' has changed, but only if also a.b<sub>1</sub> !== a.b<sub>2</sub> and a<sub>1</sub> !== a<sub>2</sub>.
* if any of a.b.c<sub>1</sub> === a.b.c<sub>2</sub> a.b<sub>1</sub> === a.b<sub>2</sub> and a<sub>1</sub> === a<sub>2</sub>, we assume 'c' has not changed.

The only exception is for collections (arrays of objects) at which case 
1. we only update the DOM if the array itself has changed --> arr<sub>1</sub> !== arr<sub>2</sub>
2. for the array items, we check correlation using `trackBy` id or key - while still requiring the object has been updated.
   We require arr[x]<sub>1</sub> !== arr[x]<sub>2</sub>, and then using `trackBy` we decide if we have a new item or an updated item.

## 5. DOM updated based on reconciliation on Data, not Virtual DOM or real DOM.

Reconciliation on data means we do not reconcile DOM structures that are static in nature, like static attributes, 
wrapper semantic / structural / layout elements, etc. We only reconcile on what the application can actually change on runtime.

## 6. All components are 3rd party security ready
all jay components can run as secure / sandboxed 3rd party components. 
There is special syntax for 3rd party components.

## 7. Zero Trust
Jay is based on the zero trust principle, meaning we consider all 3rd party code (any component code) as untrusted.
We only run selective code extracted from the component in the main environment (trusted environment), based on
models of trusted code extraction from untrusted code.

Those include
1. extracting declarative code, like Jay Files or JSX declarative statements
2. extracting code matching declared patterns

In the future, also
3. AI Based models

