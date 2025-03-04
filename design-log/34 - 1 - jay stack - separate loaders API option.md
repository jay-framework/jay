# Jay Stack - Loaders APIs option

With this option we define hooks for slowly and fast changing data that separate functions then the component function,
connected via the `makePageComponentFunction`.

The main advantage of this option is that it is simple, no need for special compiler tricks,
as well as it is strongly typed.

## the product page component file

```typescript
import { render, ProductPageElementRefs, ProductPageViewState } from './product-page.jay-html';
import { createSignal, makeJayComponent, Props, UrlParams } from 'jay-component';
import { StoreContext, STORE_CONTEXT } from 'fake-ecomm';

async function urlLoader(context: StoreContext): UrlParams {
   return (await context.getAllProducts())
           .map(_ => ({slug: _.slug}))
}

export interface ProductPageProps extends PageSystemProps {
   slug: string;
}

async function renderSlowlyChanging(context: StoreContext, {slug, lang}: ProductPageProps): PartialRender<ProductPageViewState, Product> {
   const product = await context.getProductBySlug(slug, lang)
   return ({
      render: {product},
      carryForward: product
   })
}

interface ProductInventory {
   inventory: number
}

async function renderFastChanging(context: StoreContext, props: ProductPageProps, product: Product): PartialRender<ProductPageViewState, ProductInventory> {
   const {inventory} = await context.getProductInventory(product.id)
   return {
      render: inventory,
      carryForward: product
   }
}

function ProductPageConstructor({ slug, lang }: Props<ProductPageProps>,
                                refs: ProductPageRefs,
                                product: Product,
                                {inventory}: ProductInventory) {

   const [selectedOption, setSelectedOption] = createSignal(product.options[0].key);

   // ... interactive event handlers

   return {
      render: {selectedOption}
   }
}

export const ProductPage = makeJayPageComponent(
        render,
        ProductPageConstructor,
        urlLoader,
        renderSlowlyChanging,
        renderFastChanging,
        StoreContext
);
```

The above flow works by
1. `makeJayPageComponent` connects all the different callbacks with zero or more server contexts
   (contexts available on the server environment)
2. running `urlLoader`, returning a set of `UrlParams`
3. For each set of return params, we run `renderSlowlyChanging`, with any required context and params as props.
   it returns a `PartialRender`, which includes an `Partial<ProductPageViewState>` to render and `carryForward` to pass
   to the next hook and the client component
4. On page rendering we run `renderFastChanging`, with the context, props and the `pageContext` returned from `renderSlowlyChanging`.
   It returns a `PartialRender`, which includes an `Partial<ProductPageViewState>` to render and `carryForward` to pass
   to the client component
5. On page loading on the client, the component client code runs with the `carryForward` from the fast hook.

## Server Context

This solution also assumes we have server context, which is created using a dedicated API,
such as

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

Another question is how can server context work with client content?
One option is to have `provideServerContext` take a function that returns
the server context and data for the client context.

```typescript
provideServerContext(STORE_CONTEXT, () => {
   return {
      context: {},
      carryForward: {}
   }
})

provideContext(STORE_CONTEXT, (carryForward) => {
    return {} // the client context
})

provideReactiveContext(STORE_CONTEXT, (carryForward) => {
   return {} // the client context
})
```




