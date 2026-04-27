# Page Components

A page component (`page.ts`) uses `makeJayStackComponent` to provide page-level data across rendering phases.

## Basic Page Component

```typescript
import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';
import type { HomePageContract } from './page.jay-contract.generated';

export const page = makeJayStackComponent<HomePageContract>()
  .withSlowlyRender(async () => {
    return phaseOutput({ heroTitle: 'Welcome', heroSubtitle: 'Build something great' }, {});
  })
  .withFastRender(async () => {
    return phaseOutput({ featuredCount: 12 }, {});
  });
```

The export name must be `page` for page-level components.

## Page Component with Params

For dynamic routes, use `withLoadParams` and access params via props:

```typescript
export const page = makeJayStackComponent<ProductPageContract>()
  .withServices(PRODUCTS_DB)
  .withLoadParams(async function* (db) {
    const products = await db.getAll();
    yield products.map((p) => ({ slug: p.slug }));
  })
  .withSlowlyRender(async (props, db) => {
    const product = await db.getBySlug(props.slug);
    if (!product) return notFound('Product not found');
    return phaseOutput(
      { title: product.name, description: product.desc },
      { productId: product.id },
    );
  })
  .withFastRender(async (props, db) => {
    const price = await db.getPrice(props.carryForward.productId);
    return phaseOutput({ price, inStock: price > 0 }, {});
  });
```

## Page Component with Interactive Phase

Add client-side interactivity:

```typescript
export const page = makeJayStackComponent<ProductPageContract>()
  .withServices(PRODUCTS_DB)
  .withSlowlyRender(async (props, db) => {
    // ... slow render
  })
  .withFastRender(async (props, db) => {
    // ... fast render
  })
  .withInteractive(function ProductPage(props, refs) {
    const [quantity, setQuantity] = createSignal(1);

    refs.addToCart.onClick(async () => {
      await addToCartAction({
        productId: props.carryForward.productId,
        quantity: quantity(),
      });
    });

    refs.quantityInput.exec$((input) => {
      input.addEventListener('change', (e) => {
        setQuantity(parseInt((e.target as HTMLInputElement).value));
      });
    });

    return {
      render: () => ({
        quantity: quantity(),
      }),
    };
  });
```

## Calling File Upload Actions

Actions created with `.withFiles()` accept browser `File` objects directly. Use `oninput` events on file inputs to drive signals, then pass them to the action:

```typescript
import { createSignal } from '@jay-framework/component';
import { uploadPhoto } from '../actions/upload.actions';

.withInteractive(function UploadPage(props, refs, fastViewState) {
    const [result, setResult] = createSignal('');
    const [selectedFile, setSelectedFile] = createSignal<File | undefined>(undefined);

    refs.fileInput.oninput(({ event }) => {
        setSelectedFile((event.target as HTMLInputElement).files?.[0]);
    });

    refs.uploadBtn.onclick(async () => {
        const file = selectedFile();
        if (!file) return;
        const res = await uploadPhoto({ caption: 'My photo', photo: file });
        setResult(res.message);
    });

    return {
        render: () => ({ result: result() }),
    };
})
```

No casting needed — browser `File` is assignable to `JayFile`.

## Combining with Headless Plugins

A page component handles page-level data. Plugin headless components handle their own data independently. Both render into the same page:

```
src/pages/products/[slug]/
├── page.jay-html          # Template: binds to both page + plugin data
├── page.jay-contract      # Page-level contract (title, breadcrumbs, etc.)
├── page.ts                # Page component
```

The jay-html template uses unprefixed bindings for page data and key-prefixed bindings for plugin data.

## Builder API Reference

See the plugin [component-structure.md](../plugin/component-structure.md) for the full builder API: `.withProps()`, `.withServices()`, `.withContexts()`, phase rendering, and render results.

## State Hooks Reference

See [component-state.md](component-state.md) for `createSignal`, `createMemo`, `createEffect`, and other hooks used in the interactive phase.
