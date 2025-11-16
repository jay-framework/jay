# Jay Full-Stack Component

The Jay API for building full-stack components that seamlessly integrate server-side rendering with client-side interactivity in the Jay framework.

## Overview

The `@jay-framework/fullstack-component` package provides a fluent builder API for creating components that can:

- **Slow Changing Server-side render** with semi-static data
- **Fast Changing Server-side render** with dynamic data on the server
- **Client-side interactivity** with reactive state management
- **Type-safe** component contracts using Jay HTML and Jay Contracts
- **Service injection** for server-side dependencies (database, API clients, etc.)
- **Context support** for client-side hierarchical state

## Features

- 🔄 **Dual Rendering**: Support for both slow (semi-static) and fast (dynamic) server-side rendering
- ⚡ **Interactive Client**: Seamless client-side interactivity with reactive signals
- 🎯 **Type Safety**: Full TypeScript support with generated contracts from Jay HTML
- 🔧 **Fluent Builder API**: Intuitive chainable API for component configuration
- 💉 **Service Injection**: Type-safe dependency injection for server-side services
- 🌐 **Context Support**: Client-side hierarchical context injection
- 📦 **URL Parameter Loading**: Built-in support for dynamic URL parameter handling
- 🚀 **Performance Optimized**: Efficient rendering with partial state updates

## Rendering Phases

- **Slow Rendering**: Use for static data that doesn't change often
- **Fast Rendering**: Use for dynamic data that can be cached
- **Partial Renders**: Only update the parts of the view state that change
- **Carry Forward**: Pass data between render phases to avoid recomputation

| Rendering Phase        | Rendered Where | When Rendered                  | Carry Forward      |
| ---------------------- | -------------- | ------------------------------ | ------------------ |
| Slowly Changing Render | SSR            | Build time or data change time | Slowly → Fast      |
| Fast Changing Render   | SSR            | Page serving                   | Fast → Interactive |
| Interactive Render     | CSR            | User interaction               | -                  |

## Installation

```bash
npm install @jay-framework/fullstack-component
```

## Quick Start

### 1. Define Your Component Contract

For headfull components, create a Jay HTML file (`my-component.jay-html`).
For headless components, create a Jay Contract file (`my-contract.jay-contract`).

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

### 2. Generate Definition Files

Run the Jay CLI to generate TypeScript definition files from your Jay HTML or contract files:

```shell
jay-cli definitions <path to your sources>
```

### 3. Build Your Full-Stack Component

```typescript
import { MyComponentContract } from './my-component.jay-html';
// or import { MyComponentContract } from './my-component.jay-contract';
import {
  makeJayStackComponent,
  partialRender,
  createJayService,
} from '@jay-framework/fullstack-component';
import { createJayContext } from '@jay-framework/runtime';

// Define your props
interface MyComponentProps {}

// Define services (server-side)
interface DatabaseService {
  getUser(id: string): Promise<User>;
}
const DATABASE_SERVICE = createJayService<DatabaseService>('Database');

// Define contexts (client-side)
interface ThemeContext {
  theme: string;
}
const ThemeContextMarker = createJayContext<ThemeContext>();

// Create the full-stack component
export const myComponent = makeJayStackComponent<MyComponentContract>()
  .withProps<MyComponentProps>()
  .withServices(DATABASE_SERVICE)
  .withContexts(ThemeContextMarker)
  .withSlowlyRender(async (props, database) => {
    // Slow rendering - static data that doesn't change often
    const user = await database.getUser('1');
    return partialRender(
      {
        id: user.id,
        name: user.name,
        age: user.age,
        address: user.address,
      },
      { id: user.id }, // Carry forward data to fast render
    );
  })
  .withFastRender(async (props, carryForward) => {
    // Fast rendering - dynamic data that can change
    return partialRender(
      {
        stars: 4.5,
        rating: 92,
      },
      { id: carryForward.id }, // Carry forward data to interactive
    );
  })
  .withInteractive((props, refs, theme) => {
    // Client-side interactivity with context
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
const component = makeJayStackComponent<MyComponentContract>();
```

### Full-Stack Component Builder Methods

#### `.withProps<PropsType>()`

Defines the component's props type.
Full-stack components that are Jay Stack pages use `PageProps` as the props.

```typescript
makeJayStackComponent<MyComponentContract>().withProps<{ userId: string }>();
```

#### `.withServices(...serviceMarkers)`

Adds server-side service markers for dependency injection.

```typescript
import { createJayService } from '@jay-framework/fullstack-component';

const DATABASE_SERVICE = createJayService<Database>('Database');
const AUTH_SERVICE = createJayService<AuthService>('Auth');

makeJayStackComponent<MyComponentContract>().withServices(DATABASE_SERVICE, AUTH_SERVICE);
```

Services are global singletons registered in `src/jay.init.ts`.

#### `.withContexts(...contextMarkers)`

Adds client-side context markers for dependency injection.

```typescript
import { createJayContext } from '@jay-framework/runtime';

const ThemeContext = createJayContext<Theme>();
const UserContext = createJayContext<User>();

makeJayStackComponent<MyComponentContract>().withContexts(ThemeContext, UserContext);
```

Contexts are hierarchical and reactive, provided by parent components using `provideContext` or `provideReactiveContext`.

#### `.withLoadParams(loadParams)`

Defines how URL parameters are loaded and converted to additional props,
on top of the props defined in `withProps`.

The function receives the services declared using `withServices`.

The function should return a generator that yields arrays of a subtype of `UrlParams`.

```typescript
interface IdParams extends UrlParams {
  id: string;
}

makeJayStackComponent<MyComponentContract>()
  .withServices(DATABASE_SERVICE)
  .withLoadParams(async function* (database: Database): AsyncIterable<IdParams[]> {
    const items = await database.getAllItems();
    yield items.map((item) => ({ id: item.id }));
  });
```

#### `.withSlowlyRender(slowlyRender)`

Defines the slow rendering function for semi-static data.

The function's `props` parameter is a composition of the props from `.withProps`,
with the subtype of `UrlParams` if using `.withLoadParams`.

After props, the function receives the services declared using `withServices`.

The function should return one of:

- `PartialRender<ViewState, CarryForward>` - for partial rendering
- `ServerError5xx` - for server errors
- `Redirect3xx` - for semi-static redirects

```typescript
makeJayStackComponent<MyComponentContract>()
  .withServices(DATABASE_SERVICE)
  .withSlowlyRender(async (props, database: Database) => {
    const data = await database.getData();
    return partialRender({ someKey: data.value }, { carryForwardKey: data.id });
  });
```

#### `.withFastRender(fastRender)`

Defines the fast rendering function for dynamic data.

The function's first parameter is `props` - a composition of the props from `.withProps`
with the subtype of `UrlParams` if using `.withLoadParams`.

The second parameter is `carryForward` from `.withSlowlyRender` if used.

After that, the function receives the services declared using `withServices`.

The function should return one of:

- `PartialRender<ViewState, CarryForward>` - for partial rendering
- `ServerError5xx` - for server errors
- `ClientError4xx` - for client errors
- `Redirect3xx` - for dynamic redirects

```typescript
makeJayStackComponent<MyComponentContract>()
  .withServices(INVENTORY_SERVICE)
  .withFastRender(async (props, carryForward, inventory: InventoryService) => {
    const status = await inventory.getStatus(carryForward.productId);
    return partialRender({ inStock: status.available > 0 }, { carryForwardKey: 'data' });
  });
```

#### `.withInteractive(componentConstructor)`

Defines the client-side interactive component.
The callback is a Jay component constructor function with `props` and `refs`.

The function's `props` parameter is a composition of the props from `.withProps`,
with the subtype of `UrlParams` if using `.withLoadParams`,
with the `carryForward` from `.withFastRender` if used.

After props and refs, the function receives the client-side contexts declared using `withContexts`.

The function is expected to return an object with a reactive `render` function as well as the client component API.

```typescript
makeJayStackComponent<MyComponentContract>()
  .withContexts(ThemeContext)
  .withInteractive((props, refs, theme: Theme) => {
    return {
      render: () => ({ interactiveData: 'value', currentTheme: theme.current }),
    };
  });
```

## Render Response Builders

### `partialRender<ViewState, CarryForward>`

Creates a successful partial render result with data to carry forward.

```typescript
return partialRender({ anotherKey: 'value' }, { carryForwardKey: 'data' });
```

### `serverError5xx(status)`

Creates a server error response (5xx status codes).

```typescript
return serverError5xx(503);
```

### `clientError4xx(status)`

Creates a client error response (4xx status codes).

```typescript
return clientError4xx(403);
// or
return notFound();
```

### `redirect3xx(status, location)`

Creates a redirect response.

```typescript
return redirect3xx(301, 'http://some.domain.com');
```

## Advanced Examples

### A Product Page with URL Parameters

```typescript
import {
  makeJayStackComponent,
  PageProps,
  partialRender,
  UrlParams,
  createJayService,
} from '@jay-framework/fullstack-component';
import { render, PageElementRefs } from './page.jay-html';
import { Props } from '@jay-framework/component';
import { PRODUCTS_DATABASE_SERVICE, ProductsDatabase } from '../../../services/products-database';
import { INVENTORY_SERVICE, InventoryService } from '../../../services/inventory';

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

async function* urlLoader(productsDb: ProductsDatabase): AsyncIterable<ProductPageParams[]> {
  const products = await productsDb.getAllProducts();
  yield products.map(({ slug }) => ({ slug }));
}

async function renderSlowlyChanging(
  props: PageProps & ProductPageParams,
  productsDb: ProductsDatabase,
) {
  const { name, sku, price, id } = await productsDb.getProductBySlug(props.slug);
  return partialRender({ name, sku, price, id }, { productId: id });
}

async function renderFastChanging(
  props: PageProps & ProductPageParams,
  carryForward: ProductsCarryForward,
  inventory: InventoryService,
) {
  const availableProducts = await inventory.getAvailableUnits(carryForward.productId);
  const inStock = availableProducts > 0;
  return partialRender(
    { inStock },
    {
      productId: carryForward.productId,
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
  .withServices(PRODUCTS_DATABASE_SERVICE, INVENTORY_SERVICE)
  .withLoadParams(urlLoader)
  .withSlowlyRender(renderSlowlyChanging)
  .withFastRender(renderFastChanging)
  .withInteractive(ProductsPageConstructor);
```
