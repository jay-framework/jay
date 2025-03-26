import { makeJayStackComponent, PageProps, partialRender, UrlParams } from 'jay-stack-runtime';
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

async function urlLoader(): Promise<IterableIterator<ProductPageParams>> {
    return (await getProducts()).map(({ slug }) => ({ slug })).values();
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
        render: () => ({ inStock: props.inStock }),
    };
}

export const page = makeJayStackComponent(render)
    .withProps<PageProps>()
    .withLoadParams(urlLoader)
    .withSlowlyRender(renderSlowlyChanging)
    .withFastRender(renderFastChanging)
    .withInteractive(ProductsPageConstructor);
