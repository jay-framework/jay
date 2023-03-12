Context API
=====

Jay has an internal Context API based on the `constructionContextStack` in `runtime.ts`, runtime package.

The `constructionContextStack` manages a stack of `ConstructContext` which are used for the creation of 
jay elements, passing information as a context. 
* `ConstructContext` is created at the root of elements tree
* `ConstructContext` is also created for each `forEach` element in the tree
* `ConstructContext` holds the information for 
  * `refManager` - for creating and managing refs
  * `data` - the current View State in context, which changes in `forEach` for the data item
  * `forStaticElements` - are we in the context of static elements, or dynamic (as in children of `forEach`)

Jay has a second internal context API based on `componentContextStack` in `component.ts`, component package.

The `componentContextStack` manages `ComponentContext` for jay hooks. 

* `ComponentContext` is created at the root of each component.
* `ComponentContext` holds the information for
  * `reactive` - the reactive state management for the component
  * `mounts`, `unmounts` - mount and unmount callbacks for `createEffect`, called from the 
    component exposed `mount` and `unmount`.

Proposed Context API
----

The proposed API is to be based on the `constructionContextStack` in `runtime.ts`, runtime package infra, 
exposing the same context to other higher level abstractions including components and secure packages.

Proposed API
```typescript
interface JayContext<ContextType> {}

/**
 * creates a context marker
 */
declare function createContext<ContextType=unknown>(): JayContext<ContextType>

/**
 * provides context to child stack frames of the `callback` parameter
 * If a context already exists for the same marker, this one becomes the current one
 * @param context - the context marker
 * @param value - the context value
 * @param callback - the stack frames to provide the context for
 */
declare function provideContext<ContextType>(context: JayContext<ContextType>, value: ContextType, callback: () => void)

/**
 * 
 * @param context
 */
declare function useContext<ContextType>(context: JayContext<ContextType>): ContextType
declare function useOptionalContext<ContextType>(context: JayContext<ContextType>): ContextType | undefined
declare function useParentContext<ContextType>(context: JayContext<ContextType>): ContextType
```

Example usage:
```typescript
interface ComponentContext {
  reactive: Reactive,
  mounts: MountFunc[],
  unmounts: MountFunc[]   
}
const COMPONENT_CONTEXT = createContext<ComponentContext>()

provideContext(COMPONENT_CONTEXT, {}, () => {
    // ... under some deep call stack 
    let componentContext = useContext(COMPONENT_CONTEXT)
})
```

Final API
----

```typescript
export interface ContextMarker<ContextType> {}
export declare function createJayContext<ContextType=unknown>(): ContextMarker<ContextType>
export declare function provideContext<ContextType, Returns>(marker: ContextMarker<ContextType>, context: ContextType, callback: () => Returns): Returns
export declare function useContext<ContextType>(marker: ContextMarker<ContextType>): ContextType
export declare function useOptionalContext<ContextType>(marker: ContextMarker<ContextType>): ContextType | undefined
```

