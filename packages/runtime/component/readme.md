# Jay Component

# Jay Component Hooks

hooks to create signals:

* [createSignal](./docs/create-signal.md)
* [createPatchableSignal](./docs/create-patchable-signal.md)

hooks to create computed values:

* [createMemo](./docs/create-memo.md)
* [createDerivedArray](./docs/create-derived-array.md)

hooks to create reactions:




## `provideContext`

* **Purpose:** Provides a context value to child components.
* **Parameters:**
    * `marker`: A unique symbol identifying the context.
    * `context`: The value to provide.
* **Returns:** Nothing.

## `provideReactiveContext`

* **Purpose:** Provides a reactive context value to child components.
* **Parameters:**
    * `marker`: A unique symbol identifying the context.
    * `mkContext`: A function that creates the initial context value.
* **Returns:** The created reactive context value.

## `useReactive`

* **Purpose:** Gets the current reactive context.
* **Returns:** The current reactive context object.
