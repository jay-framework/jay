# Jay Stack Fake Shop Example

This example demonstrates how to use Jay Stack with **services dependency injection** for server-side infrastructure.

## Services Architecture

This example showcases the new services pattern for managing server-side dependencies like databases and business logic services.

## Configuration

The `.jay` file in this directory configures the port ranges for both servers (YAML format):

```yaml
devServer:
  portRange: [3000, 3010]
  pagesBase: './src/pages' # Directory containing your Jay pages
  publicFolder: './public' # Directory for static files (CSS, JS, images, etc.)
editorServer:
  portRange: [3011, 3020]
  # editorId will be automatically set when an editor connects
```

## Usage

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the dev and editor servers:
   ```bash
   npm run dev
   ```

The CLI will automatically find available ports within the specified ranges and start both servers. You should see output like:

```
🚀 Jay Stack CLI started successfully!
📱 Dev Server: http://localhost:3000
🎨 Editor Server: http://localhost:3011 (ID: init)
📁 Pages directory: ./src/pages
📁 Public folder: ./public
```

You can now develop and edit your Jay app using these servers. Static files in the `public` folder will be served automatically.

## Services

The fake-shop uses two services:

### 1. ProductsDatabaseService (`src/products-database.ts`)

Manages the product catalog with methods:

- `getProducts()` - Returns all products
- `getProductBySlug(slug)` - Finds a product by its slug

### 2. InventoryService (`src/inventory-service.ts`)

Tracks product inventory with methods:

- `getAvailableUnits(productId)` - Returns stock count
- `isInStock(productId)` - Checks if product is available

### Service Initialization (`src/jay.init.ts`)

Services are registered in the `src/jay.init.ts` file:

```typescript
import { onInit, registerService } from '@jay-framework/stack-server-runtime';

onInit(async () => {
  const productsDb = createProductsDatabaseService();
  registerService(PRODUCTS_DATABASE_SERVICE, productsDb);

  const inventory = createInventoryService();
  registerService(INVENTORY_SERVICE, inventory);
});
```

The dev server automatically loads this file on startup and provides lifecycle hooks for service initialization and cleanup.

### Using Services in Pages

Pages declare dependencies with `withServices()`:

```typescript
export const page = makeJayStackComponent<PageContract>()
  .withServices(PRODUCTS_DATABASE_SERVICE, INVENTORY_SERVICE)
  .withSlowlyRender(async (props, productsDb, inventory) => {
    const products = await productsDb.getProducts();
    // ...
  });
```

## Benefits

- ✅ **Type-safe** - Full TypeScript support for services
- ✅ **Testable** - Services can be easily mocked
- ✅ **Hot reload** - Services reload automatically during development
- ✅ **Clean architecture** - Clear separation between UI and business logic
