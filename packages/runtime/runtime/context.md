# Documentation for Context Management Functions

These functions provide a mechanism for managing and sharing context within a hierarchical structure,
used with `JayElement`s.

**it is intended to be an internal API for `jay-runtime` and `jay-component`**.
**The `jay-component` library defines the public Jay context API**.

## `createJayContext`

Creates a unique symbol (a `ContextMarker`) to identify a specific context type.

**Returns:** A `ContextMarker` symbol.

## `withContext`

Temporarily establishes a new context for a given block of code.

**Parameters:**
_ `marker`: The `ContextMarker` identifying the context type.
_ `context`: The actual context value to be provided. \* `callback`: The function to execute within the new context.

**Returns:** The return value of the `callback` function.

## `useContext`

Retrieves the current context value for a given `ContextMarker`.

**Parameters:** \* `marker`: The `ContextMarker` identifying the context type.

**Returns:** The current context value.

## `findContext`

Searches the current context stack for a context matching the given predicate.

**Parameters:** \* `predicate`: A function that takes a `ContextMarker` and returns a boolean indicating whether it's the desired context.

**Returns:** The found context value, or `undefined` if not found.

## `saveContext`

Saves the current context stack for later restoration. The function is used internally by JayComponent update collection
to ensure passing the right context to newly created child components.

**Returns:** The saved context stack.

## # `restoreContext`

Restores a previously saved context stack. The function is used internally by JayComponent update collection
to ensure passing the right context to newly created child components.

**Parameters:**
_ `savedContext`: The saved context stack to restore.
_ `callback`: The function to execute within the restored context.

**Returns:** The return value of the `callback` function.

# How it Works internally:

1. **Context Markers:** Unique symbols are created to identify different context types.
2. **Context Stack:** A stack-like data structure is used to manage the current context and its parent contexts.
3. **`withContext`:** Pushes a new context onto the stack, executes the callback, and then pops the context off the stack.
4. **`useContext`:** Searches the current context stack for the specified context marker and returns its associated value.
5. **`findContext`:** Searches the context stack for a context matching the given predicate.
6. **`saveContext` and `restoreContext`:** Allow for saving and restoring the current context stack, enabling complex context management scenarios.
