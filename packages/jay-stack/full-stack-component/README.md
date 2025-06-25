# Jay Full-Stack Component

The Jay API for building full-stack components that seamlessly integrate server-side rendering with client-side interactivity in the Jay framework.

## Overview

The `jay-fullstack-component` package provides a fluent builder API for creating components that can:

- **Slow Changing Server-side render** with semi-static data
- **Fast Changing Server-side render** with dynamic data on the server
- **Client-side interactivity** with reactive state management
- **Type-safe** component contracts using Jay HTML and Jay Contracts
- **Context-aware** rendering with server and client contexts

## Features

- 🔄 **Dual Rendering**: Support for both slow (semi-static) and fast (dynamic) server-side rendering
- ⚡ **Interactive Client**: Seamless client-side interactivity with reactive signals
- 🎯 **Type Safety**: Full TypeScript support with generated contracts from Jay HTML
- 🔧 **Fluent Builder API**: Intuitive chainable API for component configuration
- 🌐 **Context Support**: Server and client context injection
- 📦 **URL Parameter Loading**: Built-in support for dynamic URL parameter handling
- 🚀 **Performance Optimized**: Efficient rendering with partial state updates

## Rendering Phases 

- **Slow Rendering**: Use for static data that doesn't change often
- **Fast Rendering**: Use for dynamic data that can be cached
- **Partial Renders**: Only update the parts of the view state that change
- **Carry Forward**: Pass data between render phases to avoid recomputation

| Rendering Phase        | rendered where | When rendered                  | Carry Forward       |
|------------------------|----------------|--------------------------------|---------------------|
| Slowly Changing Render | SSR            | build time or data change time | Slowly -> Fast      |
| Fast Changing Render   | SSR            | Page Serving                   | Fast -> Interactive |
| Interactive Render     | CSR            | User Interaction               | -                   |

## Installation

```bash
npm install jay-fullstack-component
```

## Quick Start

### 1. Define Your Component Contract

For Headfull components, create a Jay HTML file (`my-component.jay-html`)
For Headless components, create a Jay Contract File (`my-contract.jay-contract`).

#### Headfull Jay-HTML Component
```html
<html>
  <head>
    <script type="application/yaml-jay">
      data:
        id: string
        name: string
        age: number
        address: string
        stars: number
        rating: number
    </script>
  </head>
  <body>
    <div>
      <h1>{name}</h1>
      <p>Age: {age}</p>
      <p>Address: {address}</p>
      <div>
        <span>Stars: {stars}</span>
        <span>Rating: {rating}</span>
      </div>
    </div>
  </body>
</html>
```

#### Headless Jay-Contract
```yaml
name: my-contract
tags:
  - tag: id
    dataType: string
  - tag: name
    dataType: string
  - tag: age
    dataType: number
  - tag: address
    dataType: string
  - tag: stars
    dataType: number
  - tag: rating
    dataType: number
```

### 2. Create definition files from the jay-html or contract file

run 
```shell
jay-cli definitions <path to your sources>
```

### 3. Build Your Full-Stack Component

```typescript
import { MyComponentContract } from './my-component.jay-html';
// or import { MyComponentContract } from './my-component.jay-contract';
import { makeJayStackComponent, partialRender } from 'jay-fullstack-component';
import { createJayContext } from 'jay-runtime';

// Define your props and contexts
interface MyComponentProps {}

interface MyContext {
  userId: string;
}

const MyContextMarker = createJayContext<MyContext>();

// Create the full-stack component
export const myComponent = makeJayStackComponent<MyComponentContract>()
    .withProps<MyComponentProps>()
    .withServerContext(MyContextMarker)
    .withSlowlyRender(async (props, myContext) => {
        // Slow rendering - static data that doesn't change often
        return partialRender(
            {
                id: '1',
                name: 'John Doe',
                age: 30,
                address: '123 Main St, City, State',
            },
            { id: '1' }, // Carry forward data to fast render
        );
    })
    .withFastRender(async (props, myContext) => {
        // Fast rendering - dynamic data that can change
        return partialRender(
            {
                stars: 4.5,
                rating: 92,
            },
            { id: '1' }, // Carry forward data to interactive
        );
    })
    .withInteractive((props, refs) => {
        // Client-side interactivity
        return {
            render: () => ({
                stars: 4.5,
                rating: 92,
            }),
        };
    });
```

## API Reference

### Core Functions

#### `makeJayStackComponent<Contract>()`

Creates a new full-stack component builder with the specified contract type.

```typescript
const component = makeJayStackComponent<MyComponentContract>()
```

### Full-Stack Component Builder Methods

#### `.withProps<PropsType>()`

Defines the component's props type.
Full Stack Components who are Jay Stack Pages use `PageProps` as the props.

```typescript
makeJayStackComponent<MyComponentContract>()
    .withProps<{ userId: string }>()
```

#### `.withServerContext(...contextMarkers)`

Adds server-side context markers for dependency injection.

```typescript
makeJayStackComponent<MyComponentContract>()    
    .withServerContext(DatabaseContext, AuthContext)
```

#### `.withClientContext(...contextMarkers)`

Adds client-side context markers for dependency injection.

```typescript
makeJayStackComponent<MyComponentContract>()
    .withClientContext(ThemeContext, UserContext)
```

#### `.withLoadParams(loadParams)`

Defines how URL parameters are loaded and converted to additional props,
on top of the props defined in `withProps`.

The function gets the server contexts declared using `withServerContext`.

The function should return a generator of an array of a subtype of `UrlParams`

```typescript
interface IdParams extends UrlParams {
    id: string;
}

makeJayStackComponent<MyComponentContract>()
    .withLoadParams(async function* (contexts): AsyncIterable<IdParams[]> {
        yield [{ id: '1' }, { id: '2' }];
    })
```

#### `.withSlowlyRender(slowlyRender)`

Defines the slow rendering function for semi-static data.

The function props is a composition of the props from `.withProps`, 
with the subtype of `UrlParams` if using `.withLoadParams`.

The function should return one of  
* `PartialRender<ViewState, CarryForward>` - for partial rendering
* `ServerError5xx` - for errors
* `Redirect3xx` - for semi-static redirects

```typescript
makeJayStackComponent<MyComponentContract>()
    .withSlowlyRender(async (props, ...contexts) => {
        return partialRender(
            { someKey: 'value' },
            { carryForwardKey: 'data' }
        );
    })
```

#### `.withFastRender(fastRender)`

Defines the fast rendering function for dynamic data.

The function props is a composition of the props from `.withProps`,
with the subtype of `UrlParams` if using `.withLoadParams`,
with the `carryForward` from `.withSlowlyRender` if used.

The function should return one of 
* `PartialRender<ViewState, CarryForward>` - for partial rendering
* `ServerError5xx` - for errors
* `ClientError4xx` - for errors
* `Redirect3xx` - for semi-static redirects

```typescript
makeJayStackComponent<MyComponentContract>()    
    .withFastRender(async (props, ...contexts) => {
        return partialRender(
            { anotherKey: 'value' },
            { carryForwardKey: 'data' }
        );
    })
```

#### `.withInteractive(componentConstructor)`

Defines the client-side interactive component. 
The callback is a Jay component constructor function with `props` and `refs`.

The function props is a composition of the props from `.withProps`,
with the subtype of `UrlParams` if using `.withLoadParams`,
with the `carryForward` from `.withFastRender` if used.

The function is expected to return an object with a reactive `render` function as well as the client component API.

```typescript
makeJayStackComponent<MyComponentContract>()
    .withInteractive((props, refs) => {
        return {
            render: () => ({ interactiveData: 'value' }),
        };
    })
```

## Render Response Builders

### `partialRender<ViewState, CarryForward>`

Represents a successful partial render with data to carry forward.

```typescript
return partialRender(            
        { anotherKey: 'value' },
        { carryForwardKey: 'data' }
)
```

### `ServerError5xx`

Represents a server error (5xx status codes).

```typescript
return serverError5xx(503);
```

### `ClientError4xx`

Represents a client error (4xx status codes).

```typescript
return clientError4xx(403)
//
return notFound()
```

### `Redirect3xx`

Represents a redirect response.

```typescript
return redirect3xx(301, 'http://some.domain.dom')
```

## Advanced Examples

### A Product Page with Params

```typescript
import {
  makeJayStackComponent,
  PageProps,
  partialRender,
  UrlParams,
} from 'jay-fullstack-component';
import { render, PageElementRefs } from './page.jay-html';
import { Props } from 'jay-component';
import { getProductBySlug, getProducts } from '../../../products-database';
import { getAvailableUnits } from '../../../inventory-service';

interface ProductPageParams extends UrlParams {
  slug: string;
}

interface ProductsCarryForward {
  productId: string;
}
interface ProductAndInventoryCarryForward {
  productId: string;
  inStock: boolean;
}

async function* urlLoader(): AsyncIterable<ProductPageParams[]> {
  const products = await getProducts();
  yield products.map(({ slug }) => ({ slug }));
}

async function renderSlowlyChanging(props: PageProps & ProductPageParams) {
  const { name, sku, price, id } = await getProductBySlug(props.slug);
  return partialRender({ name, sku, price, id }, { productId: id });
}

async function renderFastChanging(props: PageProps & ProductPageParams & ProductsCarryForward) {
  const availableProducts = await getAvailableUnits(props.productId);
  const inStock = availableProducts > 0;
  return partialRender(
          { inStock },
          {
            productId: props.productId,
            inStock,
          },
  );
}

function ProductsPageConstructor(
        props: Props<PageProps & ProductPageParams & ProductAndInventoryCarryForward>,
        refs: PageElementRefs,
) {
  return {
    render: () => ({}),
  };
}

export const page = makeJayStackComponent<typeof render>()
        .withProps<PageProps>()
        .withLoadParams(urlLoader)
        .withSlowlyRender(renderSlowlyChanging)
        .withFastRender(renderFastChanging)
        .withInteractive(ProductsPageConstructor);
```
