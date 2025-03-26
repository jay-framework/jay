# Jay Stack - name convention based APIs option

This option is the option introduced in [20 - component compiler.md](20%20-%20component%20compiler.md)
using the naming convention of `$` for fast changing values and `$$` for slowly changing values.

For example

```typescript
import { render, ProductPageElementRefs } from './product-page.jay-html';
import { createSignal, makeJayComponent, Props, UrlParams } from 'jay-component';
import { StoreContext, STORE_CONTEXT } from 'fake-ecomm';

export interface ProductPageProps extends PageSystemProps {
  slug: string;
}

async function urlLoader(context: StoreContext): UrlParams {
  return (await context.getAllProducts()).map((_) => ({ slug: _.slug }));
}

function ProductPageConstructor(
  { slug, lang }: Props<ProductPageProps>,
  refs: ProductPageRefs,
  context: StoreContext,
) {
  let [product, setProduct] = createState$$(); // fast changing data
  let [inventory, setInventory] = createState$(); // slowly changing data

  renderSlowlyChanging(async () => {
    setProduct(await context.getProductBySlug(slug(), lang()));
  });

  renderFastChanging(async () => {
    setInventory(await context.getProductInventory(product.id));
  });

  const [selectedOption, setSelectedOption] = createSignal(product.options[0].key);

  // ... interactive event handlers

  return {
    render: { ...product, inventory, selectedOption },
  };
}

export const ProductPage = makeJayPageComponent(
  render,
  ProductPageConstructor,
  urlLoader,
  STORE_CONTEXT,
);
```

This option has the same issue as [34 - 2 - jay stack - hooks style API option.md](34%20-%202%20-%20jay%20stack%20-%20hooks%20style%20API%20option.md)
of typing of the context API for server and client environments.
