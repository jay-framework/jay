Refactor Refs
=======

First of all, lets understand why.

1. today, references are created as part of the `JayElement` creation, which is done 
   as part of the render function `render: (vs: ViewState) => JayElement`. 

   However, we have a cycling problem with `JayComponent`, that requires `refs` to run 
   the initial function to create the `ViewState` which is used for the render function which
   creates the `refs`...

2. We have two implementations of `Refs` - for main and sandbox, and those are different

3. We have 4 types of `Refs` for each environment - HTML element, collection of HTML Elements
   Component and collection of components. In effect, we also need to have 2 additional types for 
   conditional HTML Element and conditional component

4. We have inconsistencies in declaring `Refs` - for the main environment, we declare the dynamic
   refs. For the sandbox environment, we declare dynamic elements and components

All of the above "smalls" like we need a new pattern

The new Pattern
=============

We want a pattern at which when creating the `JayElement`, the `refs` are created first, allowing
the component to be created, generate the `ViewState`, then render the `JayElement`.

In essence, it is moving from
```typescript
export function render(vs: ViewState): JayElement<ViewState> {}
```

into 
```typescript
export function mkElement(): JayElement<ViewState> {
   const refs: Record<string, Ref> = {};
   const title = refs['title'] = ref();
   const name = refs['name'] = ref();
    // ... declare refs            
    return [publicRefsAPI(refs), 
        function render(vs: ViewState): JayElement<ViewState> {}
            ]
}
```

Using this pattern we will create all refs - static, conditional or collection (denoted dynamic above)
in the first section, transform all to their public API and return both the `refs` and `render`.

# lets explore the Refs API

## private API

looking at `element.ts/mkRef` before this refactor - 

```typescript
function mkRef(refName: string, referenced: HTMLElement | JayComponent<any, any, any>, updates: updateFunc<any>[], mounts: MountFunc[], unmounts: MountFunc[], isComp: boolean) {
   let context = currentConstructionContext();
   let [ref, update] = context.refManager.mkRef(referenced, context, refName, isComp);
   updates.push(update);
   if (context.forStaticElements) {
      context.refManager.addStaticRef(refName, ref);
   }
   else {
      let refManager = context.refManager;
      mounts.push(() => refManager.addDynamicRef(refName, ref))
      unmounts.push(() => refManager.removeDynamicRef(refName, ref))
   }
}
```

we see that the interaction of the `element.ts` structure with refs is contained within a simple contract - 
1. when we have an element, static or dynamic, we create a ref instance for it and add it to the ref manager
2. when calling mount or unmount for dynamic refs, we add or remove the reference.

We can turn this function around so that it accepts as a parameter the ref private API, where such an API is
1. it has an `update` function
2. it has `mount` and `unmount` functions to add and remove dynamic elements, or just add static elements
given the creation of refs will be outside of the mkRef function, there is no need for the reference manager

the function can turn into
```typescript
function mkRef(ref: ReferencePrivateAPI, referenced: HTMLElement | JayComponent<any, any, any>, updates: updateFunc<any>[], mounts: MountFunc[], unmounts: MountFunc[]) {
   let context = currentConstructionContext();
    updates.push(ref.update);
   if (context.forStaticElements) {
       ref.mount(referenced)
   }
   else {
      mounts.push(() => ref.mount(referenced))
      unmounts.push(() => ref.unmount(referenced))
   }
}
```

those, the private API for any type of ref is 
```typescript
interface ReferencePrivateAPI<ViewState> {
   updateFunc<ViewState>,
   mount(referenced: HTMLElement | JayComponent<any, any, any>),
   unmount(referenced: HTMLElement | JayComponent<any, any, any>),
   getPublicAPI: ReferencePublicAPI /* will be element or component API, depending on the actual type of the ref */
}
```


## HTMLElement Ref

```typescript
interface HTMLElementPrivateRef<ViewState> {
   addEventListener<E extends Event>(type: string, listener: JayEventHandler<E, ViewState, any>, options?: boolean | AddEventListenerOptions): void
   removeEventListener<E extends Event>(type: string, listener: JayEventHandler<E, ViewState, any>, options?: EventListenerOptions | boolean): void
   $exec<T>(handler: (elem: Element, viewState: ViewState) => T): Promise<T>
   update(newData: ViewState)
   getPublicAPI(): HTMLElementRef
}

interface HTMLElementRef extends GlobalJayEvents<ViewState>, HTMLElementProxyTarget<ViewState, ElementType>, HTMLNativeExec<ViewState, ElementType> {}
```



