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

Jay Stack components support three rendering phases, each optimized for different data lifecycles:

| Rendering Phase    | Rendered Where | When Rendered                  | Use Case                          |
| ------------------ | -------------- | ------------------------------ | --------------------------------- |
| **Slow (Static)**  | SSR            | Build time or data change time | Product names, descriptions, SKUs |
| **Fast (Dynamic)** | SSR            | Page serving (per request)     | Inventory, pricing, availability  |
| **Interactive**    | CSR            | User interaction               | Cart count, user selections       |

### Phase-Based Type Validation

Jay Stack automatically generates **phase-specific ViewState types** from your contracts, ensuring that each render function can only return properties appropriate for its phase. This prevents accidentally including fast-changing data in slow renders or slow data in fast renders.

**Benefits:**

- 🛡️ **Compile-time safety**: TypeScript catches phase violations before deployment
- 📝 **Self-documenting**: The contract explicitly shows which data is static vs dynamic
- ⚡ **Performance**: Ensures optimal caching and rendering strategies
- 🎯 **Intent clarity**: Makes data lifecycle explicit in the contract

**Example:**

```typescript
// TypeScript automatically knows which properties are valid in each phase
.withSlowlyRender(async () => {
    return partialRender({
        productName: 'Widget',   // ✅ Allowed (slow phase)
        price: 29.99,           // ❌ TypeScript Error: Not in SlowViewState
    }, {});
})
.withFastRender(async () => {
    return partialRender({
        price: 29.99,           // ✅ Allowed (fast phase)
        productName: 'Widget',   // ❌ TypeScript Error: Not in FastViewState
    }, {});
})
```

### Specifying Phases in Contracts

You can annotate your contract properties with the `phase` attribute to control when data is rendered:

#### Jay HTML Contract

```html
<html>
  <head>
    <script type="application/yaml-jay">
      data:
        # Static data - rendered at build time
        - {tag: productName, dataType: string, phase: slow}
        - {tag: description, dataType: string, phase: slow}
        - {tag: sku, dataType: string, phase: slow}

        # Dynamic data - rendered per request
        - {tag: price, dataType: number, phase: fast}
        - {tag: inStock, dataType: boolean, phase: fast}

        # No phase specified = defaults to 'slow'
        - {tag: category, dataType: string}
    </script>
  </head>
  <body>
    <div>
      <h1>{productName}</h1>
      <p>{description}</p>
      <p>Price: ${price}</p>
    </div>
  </body>
</html>
```

#### Jay Contract (Headless)

```yaml
name: product-contract
tags:
  # Static product information
  - tag: productName
    dataType: string
    phase: slow

  - tag: description
    dataType: string
    phase: slow

  - tag: sku
    dataType: string
    phase: slow

  # Dynamic pricing and availability
  - tag: price
    dataType: number
    phase: fast

  - tag: inStock
    dataType: boolean
    phase: fast

  # Interactive elements go in refs, not data
  interactive:
    - tag: addToCartButton
      elementType: [button]
```

**Phase Rules:**

- `slow`: Value is set at build time (default if not specified)
- `fast`: Value is set at request time
- `fast+interactive`: Value is set at request time and can be modified on the client
- `interactive` tags are implicitly `fast+interactive` and go into the `Refs` type, not `ViewState`
- For nested objects, the parent's phase serves as the default for children
- Array children cannot have an earlier phase than their parent array

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
        # User profile data - slow changing
        - {tag: id, dataType: string, phase: slow}
        - {tag: name, dataType: string, phase: slow}
        - {tag: age, dataType: number, phase: slow}
        - {tag: address, dataType: string, phase: slow}

        # User ratings - fast changing
        - {tag: stars, dataType: number, phase: fast}
        - {tag: rating, dataType: number, phase: fast}
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
  # User profile data - slow changing
  - tag: id
    dataType: string
    phase: slow

  - tag: name
    dataType: string
    phase: slow

  - tag: age
    dataType: number
    phase: slow

  - tag: address
    dataType: string
    phase: slow

  # User ratings - fast changing
  - tag: stars
    dataType: number
    phase: fast

  - tag: rating
    dataType: number
    phase: fast
```

### 2. Generate Definition Files

Run the Jay CLI to generate TypeScript definition files from your Jay HTML or contract files:

```shell
jay-cli definitions <path to your sources>
```

This will generate a `.d.ts` file with:

- **Full ViewState**: All properties from your contract
- **Phase-specific ViewStates**: Separate types for `Slow`, `Fast`, and `Interactive` phases
- **Contract type**: A `JayContract` type that includes all ViewState types

**Generated Types Example** (`my-component.jay-html.d.ts`):

```typescript
import { JayContract } from '@jay-framework/fullstack-component';

// Full ViewState - all properties
export interface MyComponentViewState {
  id: string;
  name: string;
  age: number;
  address: string;
  stars: number;
  rating: number;
}

export interface MyComponentElementRefs {}

// Phase-specific ViewStates (automatically generated)
export type MyComponentSlowViewState = Pick<
  MyComponentViewState,
  'id' | 'name' | 'age' | 'address'
>;
export type MyComponentFastViewState = Pick<MyComponentViewState, 'stars' | 'rating'>;
export type MyComponentInteractiveViewState = {};

// Contract type with all ViewState types
export type MyComponentContract = JayContract<
  MyComponentViewState,
  MyComponentElementRefs,
  MyComponentSlowViewState,
  MyComponentFastViewState,
  MyComponentInteractiveViewState
>;
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

- `PartialRender<SlowViewState, CarryForward>` - for partial rendering
- `ServerError5xx` - for server errors
- `Redirect3xx` - for semi-static redirects

**Type Safety:** TypeScript automatically validates that `partialRender` only receives properties from `SlowViewState` (as defined by `phase: slow` in your contract).

```typescript
makeJayStackComponent<MyComponentContract>()
  .withServices(DATABASE_SERVICE)
  .withSlowlyRender(async (props, database: Database) => {
    const data = await database.getData();
    return partialRender(
      {
        productName: data.name, // ✅ OK if phase: slow
        // price: data.price,      // ❌ TypeScript error if phase: fast
      },
      { carryForwardKey: data.id },
    );
  });
```

#### `.withFastRender(fastRender)`

Defines the fast rendering function for dynamic data.

The function's first parameter is `props` - a composition of the props from `.withProps`
with the subtype of `UrlParams` if using `.withLoadParams`.

The second parameter is `carryForward` from `.withSlowlyRender` if used.

After that, the function receives the services declared using `withServices`.

The function should return one of:

- `PartialRender<FastViewState, CarryForward>` - for partial rendering
- `ServerError5xx` - for server errors
- `ClientError4xx` - for client errors
- `Redirect3xx` - for dynamic redirects

**Type Safety:** TypeScript automatically validates that `partialRender` only receives properties from `FastViewState` (as defined by `phase: fast` in your contract).

```typescript
makeJayStackComponent<MyComponentContract>()
  .withServices(INVENTORY_SERVICE)
  .withFastRender(async (props, carryForward, inventory: InventoryService) => {
    const status = await inventory.getStatus(carryForward.productId);
    return partialRender(
      {
        inStock: status.available > 0, // ✅ OK if phase: fast
        price: 29.99, // ✅ OK if phase: fast
        // productName: 'Widget',        // ❌ TypeScript error if phase: slow
      },
      { carryForwardKey: 'data' },
    );
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

## RenderPipeline - Functional Composition API

The `RenderPipeline` class provides a functional programming approach to building render results with automatic error propagation and type-safe chaining.

### Why Use RenderPipeline?

Traditional render functions require manual error handling:

```typescript
// Traditional approach - verbose error handling
async function renderSlowlyChanging(props) {
  try {
    const product = await getProductBySlug(props.slug);
    if (!product) return notFound();
    return partialRender({ name: product.name }, { productId: product.id });
  } catch (error) {
    return serverError5xx(503);
  }
}
```

With `RenderPipeline`, errors propagate automatically and you get clean, chainable code:

```typescript
// RenderPipeline approach - clean and composable
async function renderSlowlyChanging(props) {
  const Pipeline = RenderPipeline.for<ProductSlowVS, ProductCF>();

  return Pipeline.try(() => getProductBySlug(props.slug))
    .recover((err) => Pipeline.serverError(503, 'Database unavailable'))
    .map((product) => (product ? product : Pipeline.notFound('Product not found')))
    .toPhaseOutput((product) => ({
      viewState: { name: product.name },
      carryForward: { productId: product.id },
    }));
}
```

### Key Features

- **Type-safe from start**: Declare target `ViewState` and `CarryForward` types upfront
- **Unified `map()`**: Handles sync values, async values, and conditional errors
- **Automatic error propagation**: Errors pass through the chain untouched
- **Single async point**: Only `toPhaseOutput()` is async - all `map()` calls are sync
- **Clean error recovery**: Handle errors at any point with `recover()`

### Basic Usage

```typescript
import { RenderPipeline } from '@jay-framework/fullstack-component';

// 1. Create a typed pipeline factory
const Pipeline = RenderPipeline.for<MyViewState, MyCarryForward>();

// 2. Start the pipeline
Pipeline.ok(value)                    // Start with a value
Pipeline.try(() => fetchData())       // Start with a function (catches errors)
Pipeline.notFound('Not found')        // Start with an error

// 3. Transform with map()
pipeline
    .map(x => x * 2)                           // Sync transformation
    .map(async x => fetchDetails(x))           // Async transformation
    .map(x => x.valid ? x : Pipeline.notFound()) // Conditional error

// 4. Handle errors with recover()
pipeline.recover(err => Pipeline.ok({ fallback: true }))

// 5. Produce final output with toPhaseOutput()
pipeline.toPhaseOutput(data => ({
    viewState: { ... },
    carryForward: { ... }
}))
```

### Complete Example

```typescript
import { RenderPipeline, SlowlyRenderResult } from '@jay-framework/fullstack-component';

interface ProductViewState {
  name: string;
  price: number;
}

interface ProductCarryForward {
  productId: string;
  inventoryItemId: string;
}

async function renderSlowlyChanging(
  props: PageProps & { slug: string },
): Promise<SlowlyRenderResult<ProductViewState, ProductCarryForward>> {
  const Pipeline = RenderPipeline.for<ProductViewState, ProductCarryForward>();

  return Pipeline.try(() => getProductBySlug(props.slug))
    .recover((err) => Pipeline.serverError(503, 'Database unavailable'))
    .map((product) =>
      product ? product : Pipeline.notFound('Product not found', { slug: props.slug }),
    )
    .map(async (product) => {
      // Chain additional async operations
      const pricing = await getPricing(product.id);
      return { ...product, pricing };
    })
    .toPhaseOutput((data) => ({
      viewState: {
        name: data.name,
        price: data.pricing.amount,
      },
      carryForward: {
        productId: data.id,
        inventoryItemId: data.inventoryItemId,
      },
    }));
}
```

### API Reference

#### `RenderPipeline.for<ViewState, CarryForward>()`

Creates a typed pipeline factory. Returns an object with entry point methods:

```typescript
const Pipeline = RenderPipeline.for<MyViewState, MyCarryForward>();

Pipeline.ok(value); // Start with success value
Pipeline.try(fn); // Start with function (catches errors)
Pipeline.from(outcome); // Start from existing RenderOutcome
Pipeline.notFound(msg, details); // Start with 404 error
Pipeline.badRequest(msg); // Start with 400 error
Pipeline.unauthorized(msg); // Start with 401 error
Pipeline.forbidden(msg); // Start with 403 error
Pipeline.serverError(status, msg); // Start with 5xx error
Pipeline.clientError(status, msg); // Start with 4xx error
Pipeline.redirect(status, url); // Start with redirect
```

#### `pipeline.map(fn)`

Transforms the working value. Always returns `RenderPipeline` (sync).

The function can return:

- `U` - Plain value (sync transformation)
- `Promise<U>` - Async value (resolved at `toPhaseOutput`)
- `RenderPipeline<U>` - For conditional errors/branching

```typescript
pipeline
  .map((x) => x * 2) // Sync
  .map(async (x) => fetchData(x)) // Async
  .map((x) => (x.valid ? x : Pipeline.notFound())); // Conditional
```

#### `pipeline.recover(fn)`

Handles errors, potentially recovering to success:

```typescript
pipeline.recover((error) => {
  console.error('Error:', error.message);
  return Pipeline.ok({ fallback: true });
});
```

#### `pipeline.toPhaseOutput(fn)`

Converts to final `RenderOutcome`. This is the **only async method**.

Resolves all pending promises and applies the final mapping to produce `ViewState` and `CarryForward`:

```typescript
await pipeline.toPhaseOutput((data) => ({
  viewState: { name: data.name, value: data.value },
  carryForward: { id: data.id },
}));
```

#### Utility Methods

```typescript
pipeline.isOk(); // true if success state
pipeline.isError(); // true if error state
```

### Error Types with Messages

All error types now support optional `message`, `code`, and `details`:

```typescript
Pipeline.notFound('Product not found', { slug: 'my-product' });
Pipeline.serverError(503, 'Database unavailable', { retryAfter: 30 });
```

The error types are:

- `ServerError5xx` - Server errors (5xx status codes)
- `ClientError4xx` - Client errors (4xx status codes)
- `Redirect3xx` - Redirects (3xx status codes)

## Complete Example with Phase Validation

Here's a complete example showing how phase annotations in your contract provide compile-time type safety:

### 1. Define Contract with Phases

**`user-profile.jay-html`**:

```html
<html>
  <head>
    <script type="application/yaml-jay">
      data:
        # Static user info - rendered at build time
        - {tag: userId, dataType: string, phase: slow}
        - {tag: username, dataType: string, phase: slow}
        - {tag: bio, dataType: string, phase: slow}

        # Dynamic activity - rendered per request
        - {tag: lastSeen, dataType: string, phase: fast}
        - {tag: isOnline, dataType: boolean, phase: fast}
        - {tag: followerCount, dataType: number, phase: fast}
    </script>
  </head>
  <body>
    <div>
      <h1>{username}</h1>
      <p>{bio}</p>
      <p>Followers: {followerCount}</p>
      <span>{isOnline ? 'Online' : 'Last seen: ' + lastSeen}</span>
    </div>
  </body>
</html>
```

### 2. Generated Types

**`user-profile.jay-html.d.ts`** (auto-generated):

```typescript
export interface UserProfileViewState {
  userId: string;
  username: string;
  bio: string;
  lastSeen: string;
  isOnline: boolean;
  followerCount: number;
}

export interface UserProfileElementRefs {}

// Phase-specific types - automatically generated
export type UserProfileSlowViewState = Pick<UserProfileViewState, 'userId' | 'username' | 'bio'>;
export type UserProfileFastViewState = Pick<
  UserProfileViewState,
  'lastSeen' | 'isOnline' | 'followerCount'
>;
export type UserProfileInteractiveViewState = {};

export type UserProfileContract = JayContract<
  UserProfileViewState,
  UserProfileElementRefs,
  UserProfileSlowViewState,
  UserProfileFastViewState,
  UserProfileInteractiveViewState
>;
```

### 3. Implement with Type Safety

```typescript
import {
  makeJayStackComponent,
  partialRender,
  createJayService,
} from '@jay-framework/fullstack-component';
import { UserProfileContract } from './user-profile.jay-html';

interface UserDatabase {
  getUser(id: string): Promise<{ id: string; name: string; bio: string }>;
}
const USER_DB = createJayService<UserDatabase>('UserDB');

interface ActivityService {
  getUserActivity(id: string): Promise<{ lastSeen: string; isOnline: boolean; followers: number }>;
}
const ACTIVITY_SERVICE = createJayService<ActivityService>('Activity');

export const userProfile = makeJayStackComponent<UserProfileContract>()
  .withProps()
  .withServices(USER_DB, ACTIVITY_SERVICE)
  .withSlowlyRender(async (props, userDb) => {
    // ✅ TypeScript knows only slow properties are allowed
    const user = await userDb.getUser('123');
    return partialRender(
      {
        userId: user.id,
        username: user.name,
        bio: user.bio,
        // followerCount: 100,  // ❌ TypeScript Error: Property 'followerCount'
        //    does not exist in type 'UserProfileSlowViewState'
      },
      { userId: user.id },
    );
  })
  .withFastRender(async (props, carryForward, userDb, activityService) => {
    // ✅ TypeScript knows only fast properties are allowed
    const activity = await activityService.getUserActivity(carryForward.userId);
    return partialRender(
      {
        lastSeen: activity.lastSeen,
        isOnline: activity.isOnline,
        followerCount: activity.followers,
        // username: 'John',     // ❌ TypeScript Error: Property 'username'
        //    does not exist in type 'UserProfileFastViewState'
      },
      {},
    );
  })
  .withInteractive((props, refs) => {
    return {
      render: () => ({}),
    };
  });
```

**Key Benefits:**

- 🔒 **Compile-time guarantees**: TypeScript prevents phase violations before deployment
- 📊 **Clear separation**: Slow (static) data is visually separated from fast (dynamic) data
- ⚡ **Optimal performance**: Framework can cache slow data aggressively
- 🧹 **No boilerplate**: No manual type annotations needed in render functions

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
