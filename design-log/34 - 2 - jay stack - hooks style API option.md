# Jay Stack - Hooks style API option

With this option we define hooks for slowly and fast changing data that are written as part of the component.

## the product page component file

```typescript
import { render, ProductPageElementRefs } from './product-page.jay-html';
import { createSignal, makeJayComponent, Props, UrlParams } from 'jay-component';
import { StoreContext, STORE_CONTEXT } from 'fake-ecomm';

export interface ProductPageProps extends PageSystemProps {
    slug: string;
}

async function urlLoader(context: StoreContext): UrlParams {
    return (await context.getAllProducts())
        .map(_ => ({slug: _.slug}))
}

function ProductPageConstructor({ slug, lang }: Props<ProductPageProps>, refs: ProductPageRefs, context: StoreContext) {

  const product = renderSlowlyChanging(async () => {
     return await context.getProductBySlug(slug(), lang());
  })

  const {inventory} = renderFastChanging(async () => {
    const {inventory} = await context.getProductInventory(product.id)
     return {inventory}
  })

  const [selectedOption, setSelectedOption] = createSignal(product.options[0].key);

  // ... interactive event handlers
  
  return {
    render: {...product, inventory, selectedOption}
  }
}

export const ProductPage = makeJayPageComponent(render, ProductPageConstructor, urlLoader, STORE_CONTEXT);
```

The above assumes 
* The store application context is available from the jay-html importing the app, as well
  as the context has abstracted the app settings, store client and API keys.
* The `renderSlowlyChanging` function is a marker for slowly changing data loader
* The `renderFastChanging` function is a marker for fastly changing data loader
* The `makeJayPageComponent` is equivalent to `makeJayComponent`, adding the `urlLoader` function 
* The `urlLoader` is kept out of the component code as it's return, a list of slugs, makes almost no sense to be used
  as part of the component code.

Advantages
* having `renderSlowlyChanging` and `renderFastChanging` makes it simple to use the output of both in render and 
  support the cascading rendering flow
  * no need to define types of the output of one as the input of the next

Disadvantages
* how to separate the context into server context and client context?
* what if the order of the function is that `renderFastChanging` is written first, and `renderSlowlyChanging` is using it's output?

## the store context

```typescript
import { createJayContext } from 'jay-runtime';
import { provideContext } from 'jay-component';
import { createAppSettings } from 'jay-stack'

interface StoreContext {
    getAllProducts(): Promise<Product[]>
    getProductBySlug(slug: string): Promise<Product>
    getProductInventory(id: string): Promise<number>
}

export const STORE_SETTINGS = createAppSettingsMarker();
export const STORE_CONTEXT = createJayContext<StoreContext>();

export function createECommContext() {
    
    const settings = createAppSettings(STORE_SETTINGS);
    const ecommClient = new ECommClient(
        settings.getConfig('account'), 
        settings.getSecret('ecomm-api-key')
    )

    const getAllProducts = () => ecommClient.getAllProducts();
    const getProductBySlug = (slug: string) => ecommClient.getProductBySlug(slug);
    const getProductInventory = (id: string) => ecommClient.getProductInventory(id)
    
    provideContext(STORE_CONTEXT, {
        getAllProducts,
        getProductBySlug,
        getProductInventory
    })
}
```

The above context is server context by definition (using secrets and API keys).
Can we create a derivative context as a client context?
If so, can we incorporate it into the component code in a way that makes sense?

For instance, we can expand the provide context idea by introducing a server-client context - 

```typescript
interface ServerContext<T> {
    getClientContext(): T
}

declare function provideContext<
    ClientContextType,
    ServerContextType extends ServerContext<ClientContextType>>(
        marker: ContextMarker<ServerContextType>, 
        context: ServerContextType): void;
```

Still, how do we provide the `ServerContextType` to the `renderSlowlyChanging` and `renderFastChanging`, 
while providing the rest of the component the `ClientContextType`?

Another issue - is the client context the same for all pages? or do we need a different client context for each page? 

### store context - using slowly and fast changing hooks

Another solution for context is to reuse the same `renderSlowlyChanging` and `renderFastChanging` in the context creation 
functions `provideContext` and `provideReactiveContext`, such that whatever they return is used as the context for
`renderSlowlyChanging` and `renderFastChanging` component hooks.

With this solution, both in `makeJayComponent` and in `provideContext` and `provideReactiveContext` we can use
`renderSlowlyChanging` and `renderFastChanging`. 

The semantics will be that a context has now 3 versions - `slowly context`, `fast context` and `client context`.
The component or another context using a context will get the context version for each specific environment.

e.g. the example above turns into

the context:
```typescript
export function createECommContext() {

  provideContext(STORE_CONTEXT, () => {
    const slowlyChanging = renderSlowlyChanging(() => {
      const settings = createAppSettings(STORE_SETTINGS);
      const ecommClient = new ECommClient(
              settings.getConfig('account'),
              settings.getSecret('ecomm-api-key')
      )
      const getAllProducts = () => ecommClient.getAllProducts();
      const getProductBySlug = (slug: string) => ecommClient.getProductBySlug(slug);
      const getProductInventory = (id: string) => ecommClient.getProductInventory(id)
      return {getAllProducts, getProductBySlug, getProductInventory}
    })
    
    renderFastChanging(() => {
        return slowlyChanging;
    })
    
    // client context not needed in this case
  })
}
```

the component:
```typescript
function ProductPageConstructor({ slug, lang }: Props<ProductPageProps>, refs: ProductPageRefs, context: StoreContext) {

  const product = renderSlowlyChanging(async (context) => {
     return await context.getProductBySlug(slug(), lang());
  })

  const {inventory} = renderFastChanging(async (context) => {
    const {inventory} = await context.getProductInventory(product.id)
     return {inventory}
  })

  const [selectedOption, setSelectedOption] = createSignal(product.options[0].key);

  // ... interactive event handlers
  
  return {
    render: {...product, inventory, selectedOption}
  }
}

export const ProductPage = makeJayPageComponent(render, ProductPageConstructor, urlLoader, STORE_CONTEXT);
```

however, the above has type problems - 
The `provideContext` function assumes the parameter to be a value of the client context. 
The client context in this case not needed, while the interesting type is a server context, for slowly and fast changing data.

The second problem is with the usage with the component, at which case the context type that `renderSlowlyChanging` and
`renderFastChanging` are getting is not connected to the context marker.

### store context - using a dedicated server context api

with this option, we create a new concept of a server context, which `renderSlowlyChanging` and
`renderFastChanging` can use.

The only difference from providing context is that we are using `provideServerContext` instead of 
`provideContext`. This makes the context available only on the server environment.

e.g. 

```typescript
import { createJayContext } from 'jay-runtime';
import { createAppSettings, provideServerContext } from 'jay-stack'

interface StoreContext {
  getAllProducts(): Promise<Product[]>
  getProductBySlug(slug: string): Promise<Product>
  getProductInventory(id: string): Promise<number>
}

export const STORE_SETTINGS = createAppSettingsMarker();
export const STORE_CONTEXT = createJayContext<StoreContext>();

export function createECommContext() {

  const settings = createAppSettings(STORE_SETTINGS);
  const ecommClient = new ECommClient(
          settings.getConfig('account'),
          settings.getSecret('ecomm-api-key')
  )

  const getAllProducts = () => ecommClient.getAllProducts();
  const getProductBySlug = (slug: string) => ecommClient.getProductBySlug(slug);
  const getProductInventory = (id: string) => ecommClient.getProductInventory(id)

  provideServerContext(STORE_CONTEXT, {
    getAllProducts,
    getProductBySlug,
    getProductInventory
  })
}
```

And the component code changes to be 

```typescript
function ProductPageConstructor({ slug, lang }: Props<ProductPageProps>, refs: ProductPageRefs) {

  const product = renderSlowlyChanging([STORE_CONTEXT], async (context: StoreContext) => {
     return await context.getProductBySlug(slug(), lang());
  })

  const {inventory} = renderFastChanging([STORE_CONTEXT], async (context: StoreContext) => {
    const {inventory} = await context.getProductInventory(product.id)
     return {inventory}
  })

  const [selectedOption, setSelectedOption] = createSignal(product.options[0].key);

  // ... interactive event handlers
  
  return {
    render: {...product, inventory, selectedOption}
  }
}

export const ProductPage = makeJayPageComponent(render, ProductPageConstructor, urlLoader);
```

Instead of using the context marker in the `makeJayPageComponent`, we use it in the calls for `renderSlowlyChanging`
and `renderFastChanging`, which enables strong typing of the context type.

This option still has one potential problem of using client context for server and vice versa, but it is a small price.

